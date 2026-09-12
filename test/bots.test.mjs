import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRoom,act,view} from '../server/game.mjs';
import {botPrompt,prepareBotTurn} from '../server/bots.mjs';
import {runtime} from '../tools/runtime.mjs';
import '../tools/build.mjs';
import {EVIDENCE_SPOTS} from '../public/world-map.js';
import {placeBot} from '../server/world.mjs';

test('AI seat permissions and filtered prompts exclude private conversations and future chapters',()=>{
 const r=createRoom('ABC123','host','房主');
 act(r,'host','setBot',{role:1,enabled:true});const bot=r.players[1];
 assert.throws(()=>act(r,bot.id,'setBot',{role:2,enabled:true}));
 assert.throws(()=>act(r,'host','setBot',{role:1,enabled:true}));
 r.phase=1;
 assert.throws(()=>act(r,'host','setBot',{role:2,enabled:true}));
 const v=view(r,bot.id),history=[{from:'host',to:bot.id,text:'PRIVATE_A'},{from:'other',to:bot.id,text:'PRIVATE_B'},{from:'host',to:null,text:'PUBLIC'}];
 const publicPrompt=JSON.stringify(botPrompt(v,history,{turn:false,question:'你好'}));
 assert.ok(publicPrompt.includes('PUBLIC'));assert.ok(!publicPrompt.includes('PRIVATE_A'));assert.ok(!publicPrompt.includes('PRIVATE_B'));
 const privatePrompt=JSON.stringify(botPrompt(v,history,{privateTo:'host',question:'你好'}));
 assert.ok(privatePrompt.includes('PRIVATE_A'));assert.ok(!privatePrompt.includes('PRIVATE_B'));
 assert.equal(v.chapters.length,1);assert.ok(!publicPrompt.includes('solution'));
 r.phase=3;bot.ap=3;const staged=prepareBotTurn(r,bot.id);
 assert.equal(bot.clues.length,0);assert.equal(staged.players[1].clues.length,3);
});

test('AI players: D1 permissions, mentions, private scope, failure, replay and full game',async()=>{
 let mode='good',requests=[],release,started;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;
  const body=JSON.parse(raw);requests.push(body);
  if(mode==='hold'){started?.();await new Promise(r=>release=r);}
  if(mode==='fail'){res.writeHead(503);return res.end('PRIVATE PROVIDER ERROR');}
  const content=mode==='invalid'?'not json':JSON.stringify({text:'AI_TEST_REPLY',vote:{suspect:0,method:'根据目前已知证据提出指控',evidence:[]}});
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content}}]}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {mf,db}=await runtime({bindings:{DEEPSEEK_API_KEY:'test-only',AI_BASE_URL:`http://127.0.0.1:${server.address().port}`,AI_TIMEOUT_MS:'3000'}});
 let code;const users=[];const origin='http://localhost';
 async function call(path,data,u){const res=await mf.dispatchFetch(origin+path,{method:data===undefined?'GET':'POST',headers:{origin,'Content-Type':'application/json',...(u?{cookie:u.cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:res.status,data:await res.json(),res};}
 async function state(u=users[0]){return (await call('/api/state?room='+code,undefined,u)).data.state;}
 async function action(u,type,payload={},requestId=crypto.randomUUID()){const v=await state(u);return call('/api/action',{room:code,type,payload,requestId,expectedRevision:v.revision},u);}
 async function ok(u,type,payload,requestId){if(type==='investigate'){const spot=EVIDENCE_SPOTS[payload.targetId],v=await state(u);await placeBot(db,{code,phase:v.phase},u.id,spot.scene,spot.x,spot.y);}const r=await action(u,type,payload,requestId);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.botError,undefined,r.data.botError);return r.data;}
 try{
  for(let i=0;i<2;i++){const s=await call('/api/session',{});users.push({id:s.data.id,cookie:s.res.headers.get('set-cookie').split(';')[0]});}
  code=(await call('/api/create',{name:'房主',autonomousNpc:false},users[0])).data.code;
  await call('/api/join',{code,name:'朋友'},users[1]);
  assert.equal((await action(users[1],'setBot',{role:2,enabled:true})).status,400);
  for(let i=0;i<2;i++)await ok(users[i],'role',{role:i});
  await ok(users[0],'setBot',{role:2,enabled:true});await ok(users[0],'setBot',{role:2,enabled:false});
  for(let i=2;i<4;i++)await ok(users[0],'setBot',{role:i,enabled:true});
  const bots=(await state()).players.filter(p=>p.bot);assert.equal(bots.length,2);
  for(const u of users)await ok(u,'ready');await ok(users[0],'advance');
  assert.equal((await action(users[1],'botTurn',{playerId:bots[0].id})).status,403);
  assert.equal((await action(users[0],'chat',{text:'PRIVATE_A',to:bots[0].id})).status,400);
  const retryId=crypto.randomUUID();await ok(users[0],'chat',{text:'@'+bots[0].name+' 你好'},retryId);
  const count=requests.length;await ok(users[0],'chat',{text:'@'+bots[0].name+' 你好'},retryId);assert.equal(requests.length,count);
  for(mode of ['fail','invalid']){const r=await action(users[0],'botTurn',{playerId:bots[0].id});assert.match(r.data.botError,/无法回复/);assert.equal((await state()).players.find(p=>p.id===bots[0].id).ready,false);}
  mode='hold';const start=new Promise(r=>started=r);const pending=action(users[0],'chat',{text:'@'+bots[0].name+' 请稍候'});await start;
  assert.equal((await action(users[1],'chat',{text:'@'+bots[0].name+' 再问'})).status,400);
  assert.match((await state()).advanceProblem,/AI/);
  await ok(users[0],'pause');release();const cancelled=await pending;assert.match(cancelled.data.botError,/暂停/);await ok(users[0],'pause');mode='good';
  for(let phase=1;phase<=7;phase++){
   if(phase===4){for(const [id,x] of [[users[0].id,350],[bots[0].id,390]])await placeBot(db,{code,phase},id,'meeting-a',x,352);await ok(users[0],'chat',{text:'PRIVATE_A'});assert.ok((await state()).messages.some(m=>m.from===bots[0].id&&m.to===users[0].id));assert.ok(!JSON.stringify(await state(users[1])).includes('PRIVATE_A'));for(const id of [users[0].id,bots[0].id])await placeBot(db,{code,phase},id,'hall',384,368);await ok(users[1],'chat',{text:'@'+bots[0].name+' 你好'});assert.ok(!JSON.stringify(requests.at(-1)).includes('PRIVATE_A'));}

   for(const bot of bots)await ok(users[0],'botTurn',{playerId:bot.id});
   for(const u of users){
    let v=await state(u);
    if(phase===3){const t=v.targets.find(t=>t.personal&&t.available);await ok(u,'investigate',{targetId:t.id});}
    if(phase===4){const c=v.clues.find(c=>c.owned);await ok(u,'publish',{clueId:c.id});}
    if(phase===5){const t=v.targets.find(t=>t.available);await ok(u,'investigate',{targetId:t.id});}
    if(phase===7)await ok(u,'vote',{suspect:0,method:'测试推理',evidence:[]});else await ok(u,'ready');
   }
   if(phase===7){const v=await state();assert.ok(v.players.every(p=>p.voted));assert.equal(v.result,undefined);assert.ok(v.messages.some(m=>m.text.includes('已提交秘密指控')));}
   await ok(users[0],'advance');assert.equal((await state()).phase,phase+1);
  }
  assert.equal((await state()).result.votes.length,4);
 }finally{release?.();await mf.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
