import {createRoom,join,act,view,RuleError} from './game.mjs';
import {config,askAI} from './ai.mjs';
import {botTarget,prepareBotTurn,askBot} from './bots.mjs';
import assets from 'virtual:assets';
import {worldState,moveWorld,validateSpatialAction,placeBot} from './world.mjs';
import {EVIDENCE_SPOTS,spawn,privateScene} from '../public/world-map.js';
import {simulationTick} from './simulation.mjs';
import {activityView,activityAction} from './activities.mjs';
class Fault extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status)=>{throw new Fault(message,status);};
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>crypto.randomUUID().replaceAll('-','');
async function readBody(req){if(Number(req.headers.get('content-length'))>16000)fail('请求过大',413);const reader=req.body?.getReader();let size=0,parts=[];if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();fail('请求过大',413);}parts.push(value);}let raw=new Uint8Array(size),offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length;}try{const v=JSON.parse(new TextDecoder().decode(raw)||'{}');if(!v||typeof v!=='object'||Array.isArray(v))fail('无效参数');return v;}catch{fail('请求格式错误');}}
async function limit(db,key,max,window=60000){const now=Date.now();const row=await db.prepare('INSERT INTO limits(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END,until=CASE WHEN until<? THEN excluded.until ELSE until END RETURNING count').bind(key,now+window,now,now).first();if(row.count>max)fail('操作过于频繁，请稍后再试',429);}
async function identity(req,db){const cookie=req.headers.get('cookie')||'';if(cookie.length>8192)fail('Cookie过长',400);const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('mystery_session='))?.slice(16);if(!token||token.length!==64)return null;return (await db.prepare('SELECT id FROM sessions WHERE hash=? AND created>?').bind(await digest(token),Date.now()-30*86400000).first())?.id||null;}
async function room(db,code,id){if(typeof code!=='string'||! /^[A-F0-9]{6}$/.test(code))fail('请输入六位房间码');const row=await db.prepare('SELECT body FROM rooms WHERE code=?').bind(code).first();if(!row)fail('房间不存在',404);const r=JSON.parse(row.body);if(id&&!r.players.some(p=>p.id===id))fail('你不在这个房间',403);return r;}
async function save(db,r,rev,{message,seat}={}){r.revision=rev+1;
 const keys=Object.keys(r.requests);for(const k of keys.slice(0,Math.max(0,keys.length-512)))delete r.requests[k];
 const stored={...r,messages:[]};const statements=[db.prepare('UPDATE rooms SET body=?,revision=?,host=?,phase=? WHERE code=? AND revision=?').bind(JSON.stringify(stored),r.revision,r.host,r.phase,r.code,rev)];
 if(message)statements.push(db.prepare('INSERT INTO messages(id,room,sender,recipient,body,at,scene) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(message.id,r.code,message.from,message.to,message.text,message.at,message.scene||'hall'));
 if(seat)statements.push(db.prepare('INSERT INTO seats(room,player,seen) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(room,player) DO UPDATE SET seen=excluded.seen').bind(r.code,seat,Date.now()));
 return (await db.batch(statements))[0].meta.changes===1;}
async function chatRows(db,code,id,{before=null,scene=null}={}){
 const filter='room=? AND (recipient IS NULL OR recipient=? OR sender=?)'+(scene?' AND scene=?':'');
 const params=[code,id,id,...(scene?[scene]:[])];
 const n=(await db.prepare('SELECT count(*) AS n FROM messages WHERE '+filter).bind(...params).first()).n;
 const end=before===null?n:Math.min(before,n),start=Math.max(0,end-100);
 const rows=(await db.prepare('SELECT id,sender AS "from",recipient AS "to",body AS text,at,scene FROM messages WHERE '+filter+' ORDER BY rowid LIMIT ? OFFSET ?').bind(...params,end-start,start).all()).results;
 return {messages:rows,messageCount:n,before:start};
}
async function state(db,r,id,cfg){
 const rows=(await db.prepare('SELECT player,seen FROM seats WHERE room=?').bind(r.code).all()).results;
 const now=Date.now(),hostSeen=rows.find(p=>p.player===r.host)?.seen||r.createdAt,world=await worldState(db,r),scene=world.players.find(p=>p.id===id).scene;
 const signals=(await db.prepare('SELECT sender,body,at FROM signals WHERE room=? AND recipient=? AND at>?').bind(r.code,id,now-60000).all()).results;
 return {...view(r,id,rows.filter(p=>now-p.seen<20000).map(p=>p.player)),...await chatRows(db,r.code,id,{scene}),settings:r.settings||{},activities:await activityView(db,r,id),world,chatScene:scene,signals:signals.map(s=>({...JSON.parse(s.body),sender:s.sender,at:s.at})),ai:{configured:Boolean(cfg.key),model:cfg.model,remaining:Math.max(0,cfg.budget-r.aiCount)},hostAbsentSince:now-hostSeen>=20000?hostSeen:null};
}
async function runBot(db,r,id,data,bot,cfg){
 const {type,payload,requestId}=data,key=id+':'+requestId,turn=type==='botTurn';
 if(r.phase===0||r.phase===8||r.paused)fail('AI 玩家在开局后、未暂停时参与对话和行动');
 if(turn&&r.host!==id)fail('只有房主可以让 AI 完成本幕',403);
 if(turn&&r.settings?.autonomousNpc)fail('自主 NPC 会走到现场完成行动，可以暂停或召回');
 if(turn&&(bot.ready||bot.vote&&r.phase===7))fail('这位 AI 已完成本幕，可以通过 @ 继续对话');
 if(!cfg.key)fail('请先配置服务端 AI 密钥');
 if(bot.botTask?.until>Date.now())fail('这位 AI 正在思考，请稍后再试');
 if(r.aiCount>=cfg.budget)fail('本局 AI 调用次数已用完');
 const count=(await db.prepare('SELECT count(*) AS n FROM messages WHERE room=?').bind(r.code).first()).n;
 if(count>=4999)fail('本局消息上限已到达');
 const phase=r.phase,rev=r.revision;
 if(!turn)act(r,id,'chat',payload);
 bot.botTask={key,until:Date.now()+cfg.timeout+5000};r.aiCount++;r.requests[key]={bot:true,status:'pending'};
 if(!await save(db,r,rev,{message:turn?undefined:r.messages.at(-1)}))return json({message:'房间状态已更新，请重试',state:await state(db,await room(db,r.code,id),id,cfg)},409);
 let answer,botError;
 const planned=turn?prepareBotTurn(r,bot.id):r;
 const snapshot=view(planned,bot.id);
 try{
  const history=(await chatRows(db,r.code,bot.id,{scene:payload.scene||null})).messages;
  answer=await askBot(snapshot,history,{turn,question:payload.text,privateTo:payload.to?id:null},cfg);
 }catch{botError='AI 玩家暂时无法回复，本幕未自动完成；请稍后重试。';}
 for(let attempt=0;attempt<5;attempt++){
  const current=await room(db,r.code,id),revision=current.revision,p=current.players.find(q=>q.id===bot.id);
  if(p?.botTask?.key!==key)return json({type:'ack',botError:'这次回复已过期，请重新提问。',state:await state(db,current,id,cfg)});
  let updated=current,message;
  if(!botError&&(current.phase!==phase||current.paused))botError='阶段已改变或游戏已暂停，AI 回复已取消。';
  if(!botError){
   try{
    updated=turn?prepareBotTurn(current,bot.id):structuredClone(current);
    if(turn&&JSON.stringify(view(updated,bot.id).clues)!==JSON.stringify(snapshot.clues))throw new RuleError('证据有更新，请重新让 AI 完成本幕');
    if(turn){
     if(phase===7)act(updated,bot.id,'vote',answer.vote);
     else act(updated,bot.id,'ready',{value:true});
    }
    if((await db.prepare('SELECT count(*) AS n FROM messages WHERE room=?').bind(r.code).first()).n>=5000)throw new RuleError('本局消息上限已到达');
    if(!turn){const w=await worldState(db,current);if(w.players.find(p=>p.id===id).scene!==payload.scene||w.players.find(p=>p.id===bot.id).scene!==payload.scene)throw new RuleError('会话场景已改变');}
    const destination=turn?(EVIDENCE_SPOTS[updated.players.find(p=>p.id===bot.id).clues.findLast(c=>!current.players.find(p=>p.id===bot.id).clues.includes(c))]||spawn(phase)):null;
    act(updated,bot.id,'chat',{scene:payload.scene||destination.scene,text:turn&&phase===7?'我已提交秘密指控，结案后再说明我的选择。':answer.text,to:turn?null:payload.to?id:null});
    message=updated.messages.at(-1);
   }catch{updated=current;message=undefined;botError='AI 行动未通过当前规则检查，本幕未完成；请重试。';}
  }
  updated.players.find(q=>q.id===bot.id).botTask=null;
  updated.requests[key]={bot:true,status:botError?'failed':'done',...(botError?{botError}:{})};
  if(await save(db,updated,revision,{message})){if(turn&&!botError){const before=current.players.find(p=>p.id===bot.id).clues,after=updated.players.find(p=>p.id===bot.id).clues,spot=EVIDENCE_SPOTS[after.findLast(c=>!before.includes(c))]||spawn(phase);await placeBot(db,updated,bot.id,spot.scene,spot.x,spot.y);}return json({type:'ack',requestId,botError,state:await state(db,updated,id,cfg)});}
 }
 return json({type:'ack',requestId,botError:'房间更新频繁，回复未保存；请稍后检查状态再重试。',state:await state(db,await room(db,r.code,id),id,cfg)});
}
async function handle(req,env){
 const url=new URL(req.url),path=url.pathname,db=env.DB;
 if(req.method==='GET'&&Object.hasOwn(assets,path)){const a=assets[path];return new Response(a.base64?Uint8Array.from(atob(a.body),c=>c.charCodeAt(0)):a.body,{headers:{'Content-Type':a.type,'Cache-Control':'no-cache'}});}
 if(path==='/health'&&req.method==='GET'){await db.prepare('SELECT code FROM rooms LIMIT 1').all();return json({ok:true,transport:'webrtc+http',pollMs:450,worldVersion:2});}
 if(!path.startsWith('/api/'))return json({error:'不存在'},404);
 if(!['GET','POST'].includes(req.method))return json({error:'请求方式不支持'},405);
 if(req.method==='POST'&&req.headers.get('origin')!==(env.PUBLIC_ORIGIN||url.origin))fail('请求来源不允许',403);
 const id=await identity(req,db),cfg=config(env);
 if(req.method==='GET'&&path==='/api/session'){
  const list=id?(await db.prepare('SELECT rooms.code,rooms.phase FROM rooms INNER JOIN seats ON rooms.code=seats.room WHERE seats.player=?').bind(id).all()).results:[];
  return json({id,rooms:list});
 }
 if(req.method==='POST'&&path==='/api/session'){
  await readBody(req);if(id)return json({id});
  await limit(db,'session:'+(req.headers.get('CF-Connecting-IP')||'local'),80);
  const token=random()+random(),player=random();await db.prepare('INSERT INTO sessions(hash,id,created) VALUES(?,?,?)').bind(await digest(token),player,Date.now()).run();
  return json({id:player},200,{'Set-Cookie':`mystery_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${url.protocol==='https:'?'; Secure':''}`});
 }
 if(!id)fail('身份已过期，请刷新建立身份',401);
 if(req.method==='GET'&&path==='/api/state'){
  const r=await room(db,url.searchParams.get('room'),id);
  await db.prepare('UPDATE seats SET seen=? WHERE room=? AND player=? AND seen<?').bind(Date.now(),r.code,id,Date.now()-5000).run();
  await db.prepare('UPDATE positions SET seen=? WHERE room=? AND player=? AND phase=? AND seen>? AND seen<?').bind(Date.now(),r.code,id,r.phase,Date.now()-20000,Date.now()-5000).run();
  return json({type:'state',state:await state(db,r,id,cfg)});
 }
 if(req.method!=='POST')return json({error:'不存在'},404);
 const data=await readBody(req);
 if(path==='/api/npc'){
  await limit(db,'npc:'+id,60);const r=await room(db,data.room,id);
  await simulationTick(db,r.code,{actor:id,command:data.command,cfg,history:async(player,scene)=>(await chatRows(db,r.code,player,{scene})).messages});
  return json({state:await state(db,await room(db,r.code,id),id,cfg)});
 }
 if(path==='/api/cards'){
  await limit(db,'cards:'+id,100);const r=await room(db,data.room,id);return json(await activityAction(db,r,id,data));
 }
 if(path==='/api/world'){
  await limit(db,'movement:'+id,360);const r=await room(db,data.room,id);
  return json({world:await moveWorld(db,r,id,data)});
 }
 if(path==='/api/signal'){
  await limit(db,'signal:'+id,60);const r=await room(db,data.room,id);
  if(!r.players.some(p=>p.id===data.to&&!p.bot&&p.id!==id))fail('信令接收者无效',403);
  const d=data.description;if(!d||!['offer','answer'].includes(d.type)||typeof d.sdp!=='string'||d.sdp.length>12000||typeof data.epoch!=='string'||data.epoch.length>80)fail('无效连接信令');
  const body=JSON.stringify({description:{type:d.type,sdp:d.sdp},epoch:data.epoch});
  await db.prepare('INSERT INTO signals(room,sender,recipient,body,at) VALUES(?,?,?,?,?) ON CONFLICT(room,sender,recipient) DO UPDATE SET body=excluded.body,at=excluded.at').bind(r.code,id,data.to,body,Date.now()).run();return json({ok:true});
 }
 await limit(db,'action:'+id,180);
 if(path==='/api/create'){
  if((await db.prepare('SELECT count(*) AS n FROM rooms WHERE host=? AND phase<8').bind(id).first()).n>=5)fail('最多创建五个未结束的房间');
  if((await db.prepare('SELECT count(*) AS n FROM rooms').first()).n>=200)fail('服务房间上限已到达');
  let code;do{code=random().slice(0,6).toUpperCase();}while(await db.prepare('SELECT code FROM rooms WHERE code=?').bind(code).first());
  const r=createRoom(code,id,data.name);
  r.settings={rulesVersion:'npc-cards-v1',autonomousNpc:data.autonomousNpc!==false,minigamesEnabled:true};
  await db.batch([db.prepare('INSERT INTO rooms(code,revision,body,host,phase) VALUES(?,?,?,?,?)').bind(code,0,JSON.stringify(r),id,0),db.prepare('INSERT INTO seats(room,player,seen) VALUES(?,?,?)').bind(code,id,Date.now())]);
  return json({code});
 }
 if(path==='/api/join'){
  for(let tries=0;tries<5;tries++){const r=await room(db,data.code),rev=r.revision;join(r,id,data.name);
   if(await save(db,r,rev,{seat:id}))return json({code:r.code});}
  fail('房间正在更新，请重试',409);
 }
 if(path!=='/api/action')return json({error:'不存在'},404);
 const {type,requestId,payload={}}=data;if(typeof type!=='string'||typeof requestId!=='string'||! /^[\w-]{8,80}$/.test(requestId))fail('无效操作');
 let r=await room(db,data.room,id);const key=id+':'+requestId;
 if(r.requests[key]?.bot)return json({type:'ack',requestId,duplicate:true,botError:r.requests[key].botError,state:await state(db,r,id,cfg)});
 if(type==='history'){if(!Number.isInteger(payload?.before)||payload.before<0)fail('分页参数无效');return json({type:'history',requestId,...await chatRows(db,r.code,id,{before:payload.before,scene:(await worldState(db,r)).players.find(p=>p.id===id).scene})});}
 if(r.requests[key]){const cached=r.players.find(p=>p.id===id).lastAI;return json({...(cached?.requestId===requestId?cached.answer?{type:'ai',...(cached.phase===r.phase?cached.answer:{mode:'rules',text:'阶段已变化，请根据当前材料重新提问。'})}:{type:'ai',mode:'rules',text:cached.until>Date.now()?'主持仍在处理中，请稍后重试。':'上次主持回复未完成，请重新提问。'}:{type:'ack'}),requestId,duplicate:true,state:await state(db,r,id,cfg)});}
 if(data.expectedRevision!==r.revision)return json({type:'error',requestId,message:'房间状态已更新，请确认后重试',state:await state(db,r,id,cfg)},409);
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('无效操作参数');
 const spatial=await validateSpatialAction(db,r,id,type,payload);
 const bot=type==='botTurn'?r.players.find(p=>p.bot&&p.id===payload.playerId):type==='chat'?botTarget(r,payload):null;
 if(type==='botTurn'&&!bot)fail('AI 玩家不存在');
 if(bot&&type==='chat'&&spatial.world.players.find(p=>p.id===bot.id).scene!==spatial.position.scene)fail('这位 AI 不在当前场景，可以在同一场景 @ 或邀请到会客室');
 if(bot)return runBot(db,r,id,data,bot,cfg);
 if(type==='chat'&&(await db.prepare('SELECT count(*) AS n FROM messages WHERE room=?').bind(r.code).first()).n>=5000)fail('本局消息上限已到达');
 const revision=r.revision;
 if(type==='askAI'){
  if(r.phase===0||r.phase===8||r.paused)fail('当前不能提问主持');
  if(typeof payload?.question!=='string'||!payload.question.trim()||payload.question.length>1000)fail('问题为空或超过1000字');
  if(r.aiCount>=cfg.budget)fail('本局主持提问次数已用完');
  const player=r.players.find(p=>p.id===id);if(player.aiUntil>Date.now())fail('主持正在回答你的上一个问题');
  player.aiUntil=Date.now()+cfg.timeout+5000;player.lastAI={requestId,until:player.aiUntil,phase:r.phase};r.aiCount++;r.requests[key]=true;
 }else if(type==='claimHost'){
  const host=await db.prepare('SELECT seen FROM seats WHERE room=? AND player=?').bind(r.code,r.host).first();
  if(Date.now()-(host?.seen||r.createdAt)<60000)fail('房主离线满一分钟后才能接管');r.host=id;r.requests[key]=true;
 }else {act(r,id,type,payload);r.requests[key]=true;}
 if(!await save(db,r,revision,{message:type==='chat'?r.messages.at(-1):undefined})){r=await room(db,r.code,id);return json({type:'error',requestId,message:'另一位玩家刚更新了房间，请重试',state:await state(db,r,id,cfg)},409);}
 if(type==='askAI'){
  const phase=r.phase;const answer=await askAI(await state(db,r,id,cfg),payload.question,cfg);
  for(let i=0;i<5;i++){const current=await room(db,r.code,id),rev=current.revision;const p=current.players.find(p=>p.id===id);p.aiUntil=0;if(p.lastAI?.requestId===requestId)p.lastAI.answer=current.phase===phase?answer:{mode:'rules',text:'阶段已变化，请根据当前材料重新提问。'};if(await save(db,current,rev)){r=current;break;}r=current;}
  return json({type:'ai',requestId,...(r.phase===phase?answer:{mode:'rules',text:'阶段已变化，请根据当前材料重新提问。'}),state:await state(db,r,id,cfg)});
 }
 return json({type:'ack',requestId,state:await state(db,r,id,cfg)});
}
export default {async fetch(req,env){let response;try{response=await handle(req,env);}catch(error){const known=error instanceof Fault||error instanceof RuleError;if(!known)console.error('Request failed:',error.name);response=json({error:known?error.message:'服务暂时不可用，请稍后重试'},known?(error.status||400):503);}
 const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return new Response(response.body,{status:response.status,headers});}};
