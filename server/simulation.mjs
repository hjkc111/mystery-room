import {act,view,RuleError} from './game.mjs';
import {askBot} from './bots.mjs';
import {worldState} from './world.mjs';
import {SCENES,EVIDENCE_SPOTS,spawn,distance,privateScene,REACH} from '../public/world-map.js';
import {route,nextDoor,pathPosition} from '../public/navigation.js';
const readRoom=async(db,code)=>JSON.parse((await db.prepare('SELECT body FROM rooms WHERE code=?').bind(code).first()).body);
function walk(n,destination,phase,now){let end=destination,door;if(n.position.scene!==destination.scene){door=nextDoor(n.position.scene,destination.scene,phase);if(!door){n.status='waiting';return false;}end=door;}
 const points=route(n.position.scene,n.position,end);if(!points){n.status='waiting';return false;}n.path=points;n.started=now;n.door=door?.id||null;n.destination=destination;n.status='walking';return true;}
export async function simulationTick(db,code,{command,actor,cfg,history}={}){
 let r=await readRoom(db,code);if(!r.settings?.autonomousNpc||!r.players.some(p=>p.bot))return;
 const now=Date.now(),lease=crypto.randomUUID();
 await db.prepare('INSERT OR IGNORE INTO simulation(room,body) VALUES(?,?)').bind(code,JSON.stringify({phase:r.phase,at:now,npcs:{},autoCount:0})).run();
 const row=await db.prepare('UPDATE simulation SET lease=?,until=? WHERE room=? AND until<? RETURNING body,revision').bind(lease,now+25000,code,now).first();if(!row){if(command)throw new RuleError('NPC 正在处理上一项任务，请稍后重试');return;}
 try{
  const sim=JSON.parse(row.body),world=await worldState(db,r),last=sim.at;
  if(r.autoAiCount===undefined){r.autoAiCount=sim.autoCount||0;r.autoAiCalls=sim.calls||{};r.autoAiAt=sim.lastCall||0;}
  if(!command&&Object.keys(sim.npcs).length&&now-last<1500)return;
  const activityRow=await db.prepare('SELECT body FROM activities WHERE room=?').bind(code).first(),activity=activityRow?JSON.parse(activityRow.body):null;
  if(sim.phase!==r.phase){sim.phase=r.phase;sim.npcs={};sim.phaseAt=now;}
  const online=(await db.prepare('SELECT player FROM seats WHERE room=? AND seen>?').bind(code,now-20000).all()).results;
  if(!online.some(p=>r.players.some(q=>q.id===p.player&&!q.bot)))return;
  const elapsed=Math.min(2500,Math.max(0,now-last));
  for(const [i,p]of r.players.entries())if(p.bot){const n=sim.npcs[p.id]||={position:spawn(r.phase,i),status:'idle',due:now+2000,calls:0};
   if(n.path){if(r.paused||n.paused||p.botTask?.until>now)n.started+=now-last;else n.started+=Math.max(0,now-last-elapsed);const next=pathPosition(n.path,now-n.started);n.position={...n.position,x:next.x,y:next.y};
    if(next.arrived){n.path=null;if(n.door){const door=SCENES[n.position.scene].doors.find(d=>d.id===n.door),occupied=world.players.filter(q=>q.id!==p.id&&q.scene===door.to).length+Object.entries(sim.npcs).filter(([id,q])=>id!==p.id&&q.reservation?.scene===door.to&&q.reservation.until>now).length;if(privateScene(door.to)&&occupied>=2){n.status='waiting';n.due=now+2000;}else{const xy=SCENES[door.to].spawn;n.position={scene:door.to,x:xy[0]+(i-1.5)*40,y:xy[1],phase:r.phase};n.status='idle';}n.door=null;}else{n.status='interacting';n.due=now+800;}}
   }
  }
  sim.at=now;
  if(command){const p=r.players.find(p=>p.id===command.playerId&&p.bot),n=p&&sim.npcs[p.id];if(!n)throw new RuleError('AI 玩家不存在');
   if(['pause','resume','recall'].includes(command.type)){if(r.host!==actor)throw new RuleError('只有房主可以控制 NPC');if(command.type==='pause'){n.paused=true;n.status='paused';}else if(command.type==='resume'){n.paused=false;n.status='idle';}else{n.destination=spawn(r.phase,r.players.findIndex(q=>q.id===p.id));n.task='visit';n.path=null;n.paused=false;n.due=now;}}
   else if(command.type==='invite'){const own=world.players.find(p=>p.id===actor);if(!privateScene(own.scene))throw new RuleError('请先进入私人会客室');if(world.players.some(q=>q.id!==actor&&q.id!==p.id&&q.scene===own.scene)||Object.entries(sim.npcs).some(([id,q])=>id!==p.id&&q.reservation?.scene===own.scene&&q.reservation.until>now))throw new RuleError('会客室已被占用或预订');if(privateScene(n.position.scene)&&n.position.scene!==own.scene&&world.players.some(q=>q.id!==p.id&&q.scene===n.position.scene))throw new RuleError('这位 NPC 正在另一间会客室交谈');n.reservation={scene:own.scene,until:now+30000};n.destination={scene:own.scene,x:own.x>680?own.x-40:own.x+40,y:own.y};n.task='visit';n.path=null;n.due=now;}
   else if(command.type==='inviteCard'){const own=world.players.find(p=>p.id===actor);if(![0,4,8].includes(r.phase)||own.scene!=='lounge')throw new RuleError('请在休息时到休息室邀请');if(r.phase===4&&!(p.shared||[]).length)throw new RuleError('NPC 需要先分享证据');n.destination={scene:'lounge',x:424,y:304};n.task='visit';n.path=null;n.due=now;}
   else throw new RuleError('未知 NPC 操作');
  }
  let message,changed=false,called=false;
  for(const p of r.players.filter(p=>p.bot)){
   const n=sim.npcs[p.id];if(activity?.phase===r.phase&&['playing','reveal','waiting'].includes(activity.status)&&activity.seats.includes(p.id)){n.path=null;n.status='seated';continue;}if(r.paused||n.paused||n.path||n.due>now||p.botTask?.until>now)continue;
   if(n.reservation?.until<=now){n.reservation=null;n.task=null;n.destination=null;}
   if(n.task==='visit'&&n.destination){if(n.position.scene!==n.destination.scene||distance(n.position,n.destination)>12){walk(n,n.destination,r.phase,now);continue;}n.task=null;n.destination=null;n.reservation=null;n.due=now+20000;n.status='talking';continue;}
   if(privateScene(n.position.scene)&&world.players.some(q=>q.id!==p.id&&q.scene===n.position.scene)){n.status='talking';continue;}
   const v=view(r,p.id);
   if([3,5].includes(r.phase)){
    const target=v.targets.find(t=>t.available&&t.personal)||v.targets.find(t=>t.available);
    if(target){const spot=EVIDENCE_SPOTS[target.id];n.target=target.id;if(n.position.scene!==spot.scene||distance(n.position,spot)>REACH){walk(n,spot,r.phase,now);continue;}act(r,p.id,'investigate',{targetId:target.id});changed=true;n.status='interacting';n.due=now+2000;continue;}
   }
   if(r.phase===4){const clue=v.clues.find(c=>c.owned&&!(p.shared||[]).includes(c.id));if(clue){act(r,p.id,'publish',{clueId:clue.id});changed=true;n.due=now+2000;continue;}}
   if([2,6,7].includes(r.phase)&&n.spoken!==r.phase&&(called||message))continue;
   if([2,6,7].includes(r.phase)&&n.spoken!==r.phase&&!called&&!message){
    if(cfg?.key&&r.phase===7&&now-(r.autoAiAt||0)<45000){n.status='thinking';n.due=r.autoAiAt+45000;continue;}
    called=true;let answer;const canCall=cfg?.key&&(r.autoAiCount||0)<24&&(r.autoAiCalls?.[p.id]||0)<8&&r.aiCount<cfg.budget-24&&now-(r.autoAiAt||0)>=45000;
    if(canCall){
     // Reserve the shared budget before the external request, including failed requests.
     const reserved=structuredClone(r);reserved.aiCount++;reserved.autoAiCount=(reserved.autoAiCount||0)+1;reserved.autoAiCalls||={};reserved.autoAiCalls[p.id]=(reserved.autoAiCalls[p.id]||0)+1;reserved.autoAiAt=now;reserved.revision++;const ok=await db.prepare('UPDATE rooms SET body=?,revision=? WHERE code=? AND revision=?').bind(JSON.stringify({...reserved,messages:[]}),reserved.revision,code,r.revision).run();if(!ok.meta.changes)return;r=reserved;
     try{answer=await askBot(view(r,p.id),await history(p.id,n.position.scene),{turn:true},cfg);}catch{}
     const current=await readRoom(db,code);if(current.phase!==r.phase||current.paused||current.revision!==r.revision)return;
    }
    if(answer&&r.phase===7){try{act(r,p.id,'vote',answer.vote);changed=true;}catch{}}
    if(!message&&r.phase!==7){act(r,p.id,'chat',{scene:n.position.scene,text:answer?.text||'我会根据目前掌握的材料参与讨论。可以走到我身边，用 @ 向我提问。'});message=r.messages.at(-1);changed=true;}
    n.spoken=r.phase;n.status='talking';n.due=now+5000;
   }
   if(r.phase>0&&r.phase<7&&!p.ready){act(r,p.id,'ready',{value:true});changed=true;}
   if(r.phase===7){n.status=p.vote?'waiting':'thinking';continue;}
   if(!n.path&&n.due<=now){const points=[{x:160,y:368},{x:608,y:368},{x:608,y:112},{x:160,y:112}];n.roam=((n.roam||0)+1)%points.length;walk(n,{scene:n.position.scene,...points[n.roam]},r.phase,now);n.due=now+5000;}
  }
  const capacityGuard=` AND NOT EXISTS(SELECT s.scene FROM (SELECT 'meeting-a' AS scene UNION ALL SELECT 'meeting-b') s WHERE
   (SELECT count(*) FROM positions WHERE room=? AND phase=? AND scene=s.scene AND player NOT LIKE 'bot-%' AND seen>?)
   +(SELECT count(*) FROM json_each(?) n WHERE json_extract(n.value,'$.position.scene')=s.scene OR (json_extract(n.value,'$.reservation.scene')=s.scene AND json_extract(n.value,'$.reservation.until')>?))>2)`;
  const capacityParams=[code,r.phase,now-20000,JSON.stringify(sim.npcs),now];
  if(!changed){const result=await db.prepare('UPDATE simulation SET body=?,revision=revision+1,lease=NULL,until=0 WHERE room=? AND lease=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND revision=?)'+capacityGuard).bind(JSON.stringify(sim),code,lease,code,r.revision,...capacityParams).run();if(command&&!result.meta.changes)throw new RuleError('会客室已满或状态改变，请重试');return;}
  const revision=r.revision;r.revision++;const statements=[db.prepare('UPDATE rooms SET body=?,revision=? WHERE code=? AND revision=? AND EXISTS(SELECT 1 FROM simulation WHERE room=? AND lease=? AND until>?)'+capacityGuard).bind(JSON.stringify({...r,messages:[]}),r.revision,code,revision,code,lease,Date.now(),...capacityParams),db.prepare('UPDATE simulation SET body=?,revision=revision+1,lease=NULL,until=0 WHERE room=? AND lease=? AND changes()=1').bind(JSON.stringify(sim),code,lease)];
  if(message)statements.push(db.prepare('INSERT OR IGNORE INTO messages(id,room,sender,recipient,body,at,scene) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(message.id,code,message.from,message.to,message.text,message.at,message.scene));
  await db.batch(statements);
 }finally{await db.prepare('UPDATE simulation SET until=0,lease=NULL WHERE room=? AND lease=?').bind(code,lease).run();}
}
