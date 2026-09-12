import {RuleError} from './game.mjs';
import {createMatch,advanceCards,cardAction,cardView} from './blackjack.mjs';
import {worldState} from './world.mjs';
import {distance} from '../public/world-map.js';
export const TABLE={scene:'lounge',x:384,y:304};
export function gamesOpen(r){return Boolean(r.settings?.minigamesEnabled)&&[0,4,8].includes(r.phase)&&!r.paused;}
export async function activityView(db,r,id){const row=await db.prepare('SELECT body FROM activities WHERE room=?').bind(r.code).first();const g=row?JSON.parse(row.body):null;return {open:gamesOpen(r),game:g?cardView(g,id):null};}
export async function activityAction(db,r,id,data){
 const now=Date.now(),type=data.type,key=id+':'+data.requestId;
 if(!/^[\w-]{8,80}$/.test(data.requestId||''))throw new RuleError('无效请求编号');
 const world=await worldState(db,r),atTable=player=>{const p=world.players.find(q=>q.id===player);return p?.scene===TABLE.scene&&distance(p,TABLE)<=56;};
 await db.prepare('INSERT OR IGNORE INTO activities(room,body) VALUES(?,?)').bind(r.code,JSON.stringify({status:'empty',seats:[],requests:{}})).run();
 for(let attempt=0;attempt<5;attempt++){
  const row=await db.prepare('SELECT revision,body FROM activities WHERE room=?').bind(r.code).first();let g=JSON.parse(row.body);if(g.requests?.[key])return activityView(db,r,id);
  if(g.phase!==undefined&&g.phase!==r.phase&&['waiting','playing','reveal'].includes(g.status)){g.status='cancelled';g.reason='主线进入下一幕，未完成牌局已取消';}
  if(r.paused){if(!g.pausedAt)g.pausedAt=now;}else if(g.pausedAt){const delta=now-g.pausedAt;g.deadline+=delta;g.aiAt+=delta;g.pausedAt=null;}
  if(!r.paused&&['playing','reveal'].includes(g.status)){
   const seen=(await db.prepare('SELECT player,seen FROM seats WHERE room=?').bind(r.code).all()).results;
   const absent=g.seats.map(p=>!r.players.find(q=>q.id===p)?.bot&&now-(seen.find(q=>q.player===p)?.seen||0)>20000);
   if(absent.some(Boolean)){g.status='cancelled';g.reason=absent.every(Boolean)?'双方离线，牌局取消':'一方离线超过20秒，判为弃权';g.forfeit=absent;}else advanceCards(g,now,r.players.filter(p=>p.bot).map(p=>p.id));
  }
  if(type!=='tick'){
   if(type==='leave'){if(!g.seats.includes(id))throw new RuleError('你没有入座');g.status='cancelled';g.reason='玩家离席，判为弃权';g.forfeit=g.seats.map(p=>p===id);}
   else{
    if(!gamesOpen(r))throw new RuleError('小游戏仅在开场、交换证据后和结案时开放');
    const me=r.players.find(p=>p.id===id);if(r.phase===4&&!me.shared?.length)throw new RuleError('请先公开自己的证据，再休息片刻');
    if(!atTable(id))throw new RuleError('请走到休息室牌桌旁');
    if(type==='sit'){
     if(['playing','reveal'].includes(g.status))throw new RuleError('牌桌正在游戏');
     if(g.status!=='waiting'||g.deadline<=now)g={status:'waiting',seats:[],requests:{},deadline:now+30000,phase:r.phase};
     if(!g.seats.includes(id))g.seats.push(id);
     if(data.botId){const bot=r.players.find(p=>p.id===data.botId&&p.bot);if(!bot||!atTable(bot.id))throw new RuleError('请先邀请 AI 走到牌桌旁');if(!g.seats.includes(bot.id))g.seats.push(bot.id);}
     if(g.seats.length>2)throw new RuleError('牌桌已有两人');if(g.seats.length===2)g={...createMatch(g.seats,now),phase:r.phase};
    }else if(['hit','stand'].includes(type))cardAction(g,id,type,now);else throw new RuleError('未知牌桌操作');
   }
  }
  if(g.status==='waiting'&&now>=g.deadline){g.status='cancelled';g.reason='等待入座超时';}
  g.requests||={};g.requests[key]=true;for(const k of Object.keys(g.requests).slice(0,-128))delete g.requests[k];
  const result=await db.prepare('UPDATE activities SET body=?,revision=revision+1 WHERE room=? AND revision=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND revision=?)').bind(JSON.stringify(g),r.code,row.revision,r.code,r.revision).run();if(result.meta.changes)return activityView(db,r,id);
 }
 throw new RuleError('牌桌状态已更新，请重试');
}
