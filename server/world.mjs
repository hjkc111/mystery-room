import {SCENES,REACH,SPEED,spawn,allowedScenes,walkable,clearPath,distance,privateScene,EVIDENCE_SPOTS} from '../public/world-map.js';
import {RuleError} from './game.mjs';
import {pathPosition} from '../public/navigation.js';
const reject=message=>{throw new RuleError(message);};
export async function worldState(db,r){
 const rows=(await db.prepare('SELECT * FROM positions WHERE room=?').bind(r.code).all()).results,now=Date.now();
 const saved=r.settings?.autonomousNpc?await db.prepare('SELECT body FROM simulation WHERE room=?').bind(r.code).first():null,sim=saved?JSON.parse(saved.body):null;
 const players=r.players.map((p,i)=>{const row=rows.find(q=>q.player===p.id),valid=row&&row.phase===r.phase&&allowedScenes(r.phase).includes(row.scene)&&(p.bot||now-row.seen<20000);
  const n=sim?.phase===r.phase&&sim.npcs[p.id];if(p.bot&&n){const pos=n.path&&!r.paused&&!n.paused&&(p.botTask?.until||0)<=now?pathPosition(n.path,Math.max(0,Math.min(now,sim.at+2500)-n.started)):n.position;return {id:p.id,...n.position,...pos,seq:sim.at,seen:now,status:n.paused?'paused':n.status,path:n.path,started:n.started,simAt:sim.at};}
  return {id:p.id,...(valid?{scene:row.scene,x:row.x,y:row.y,phase:row.phase}:spawn(r.phase,i)),seq:row?.seq||0,seen:row?.seen||0};});
 return {players,serverTime:now};
}
export async function moveWorld(db,r,id,data){
 const world=await worldState(db,r),p=world.players.find(p=>p.id===id);if(data.phase!==r.phase)reject('阶段已更新，请等待场景切换');
 if(r.paused)reject('游戏已暂停');
 let next={...p},seq=data.seq,actor=id,priorSeq=p.seq,credit=SPEED*2;const now=Date.now();
 if(!Number.isSafeInteger(seq)||seq<=p.seq)reject('移动序号已过期');
 if(data.type==='move'){
  if(!Array.isArray(data.path)||!data.path.length||data.path.length>30)reject('无效移动轨迹');
  let length=0;
  for(const point of data.path){if(!point||!walkable(p.scene,point.x,point.y)||!clearPath(p.scene,next,point))reject('不能穿过墙壁或场景边界');length+=distance(next,point);next.x=point.x;next.y=point.y;}
  // A bounded distance budget tolerates request bunching without granting free distance per request.
  const row=await db.prepare('SELECT phase,seen,credit,moved_at FROM positions WHERE room=? AND player=?').bind(r.code,id).first();
  if(row&&row.phase===r.phase&&now-row.seen<20000)credit=Math.min(SPEED*2,row.credit+Math.max(0,now-row.moved_at)*SPEED/1000);
  if(length>credit)reject('移动过快，请等待位置同步');credit-=length;
 }else if(data.type==='door'){
  const door=SCENES[p.scene].doors.find(d=>d.id===data.target&&allowedScenes(r.phase).includes(d.to));
  if(!door||distance(p,door)>REACH)reject('请走近本阶段开放的门再按空格');
  const s=SCENES[door.to].spawn;next={...p,scene:door.to,x:s[0]+(r.players.findIndex(q=>q.id===id)-1.5)*40,y:s[1]};
 }else if(data.type==='inviteBot'){
  if(r.settings?.autonomousNpc)reject('请使用 NPC 邀请，让角色自行走来');
  if(!privateScene(p.scene))reject('请先进入私人会客室');
  const bot=r.players.find(q=>q.id===data.playerId&&q.bot);if(!bot)reject('AI 玩家不存在');
  const bp=world.players.find(q=>q.id===bot.id);
  if(privateScene(bp.scene)&&bp.scene!==p.scene&&world.players.some(q=>q.id!==bot.id&&q.scene===bp.scene))reject('这位 AI 正在另一间会客室，请稍后邀请');
  actor=bot.id;priorSeq=bp.seq;seq=bp.seq+1;next={...bp,scene:p.scene,x:p.x+40,y:p.y};if(!walkable(next.scene,next.x,next.y))next.x=p.x-40;
 }else reject('未知空间操作');
 const capacity=privateScene(next.scene)?2:99;
 const result=await db.prepare(`INSERT INTO positions(room,player,phase,scene,x,y,seen,seq,credit,moved_at)
 SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT phase FROM rooms WHERE code=?)=?
 AND (SELECT count(*) FROM positions WHERE room=? AND phase=? AND scene=? AND player<>? AND (seen>? OR player LIKE 'bot-%') AND (?=0 OR player NOT LIKE 'bot-%'))
 +(SELECT count(*) FROM simulation s,json_each(s.body,'$.npcs') n WHERE s.room=? AND json_extract(s.body,'$.phase')=? AND n.key<>? AND ?=1 AND (json_extract(n.value,'$.position.scene')=? OR (json_extract(n.value,'$.reservation.scene')=? AND json_extract(n.value,'$.reservation.until')>?)))<?
 ON CONFLICT(room,player) DO UPDATE SET phase=excluded.phase,scene=excluded.scene,x=excluded.x,y=excluded.y,seen=excluded.seen,seq=excluded.seq,credit=excluded.credit,moved_at=excluded.moved_at WHERE positions.seq=?`).bind(r.code,actor,r.phase,next.scene,next.x,next.y,now,seq,credit,now,r.code,r.phase,r.code,r.phase,next.scene,actor,now-20000,r.settings?.autonomousNpc?1:0,r.code,r.phase,actor,r.settings?.autonomousNpc?1:0,next.scene,next.scene,now,capacity,priorSeq).run();
 if(!result.meta.changes)reject('房间已满或位置已更新，请重新同步');
 return worldState(db,r);
}
export async function validateSpatialAction(db,r,id,type,payload){
 const world=await worldState(db,r),p=world.players.find(q=>q.id===id);
 if(type==='investigate'){
  const spot=EVIDENCE_SPOTS[payload.targetId];if(!spot||p.scene!==spot.scene||distance(p,spot)>REACH)reject('请走到证据旁，按空格调查');
 }
 if(type==='chat'){
  if(privateScene(p.scene)){
   const other=world.players.find(q=>q.id!==id&&q.scene===p.scene);
   if(!other)reject('会客室内还没有另一位玩家');
   if(payload.to&&payload.to!==other.id)reject('只能与当前会客室的另一位玩家私聊');
   payload.to=other.id;
  }else if(payload.to)reject('私聊需要两人进入同一间私人会客室');
  payload.scene=p.scene;
 }
 return {world,position:p};
}
export async function placeBot(db,r,id,scene,x,y){
 await db.prepare(`INSERT INTO positions(room,player,phase,scene,x,y,seen,seq) VALUES(?,?,?,?,?,?,?,1)
 ON CONFLICT(room,player) DO UPDATE SET phase=excluded.phase,scene=excluded.scene,x=excluded.x,y=excluded.y,seen=excluded.seen,seq=positions.seq+1,credit=320,moved_at=0`).bind(r.code,id,r.phase,scene,x,y,Date.now()).run();
}
