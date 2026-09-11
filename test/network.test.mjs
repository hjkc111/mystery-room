import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from '../tools/runtime.mjs';
import '../tools/build.mjs';

test('Sites Worker + actual local D1: complete game, concurrency, privacy, replay and persistence',async()=>{
 let {mf,db}=await runtime();const origin='http://localhost';let users=[];
 async function call(path,data,cookie){const res=await mf.dispatchFetch(origin+path,{method:data===undefined?'GET':'POST',headers:{origin,...(cookie?{cookie}:{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:res.status,data:await res.json(),res};}
 async function refresh(u){const result=await call('/api/state?room='+u.code,undefined,u.cookie);assert.equal(result.status,200);u.state=result.data.state;return u.state;}
 async function action(u,type,payload={},overrides={}){await refresh(u);const result=await call('/api/action',{room:u.code,type,payload,requestId:crypto.randomUUID(),expectedRevision:u.state.revision,...overrides},u.cookie);if(result.data.state)u.state=result.data.state;return result;}
 async function ok(u,type,payload,overrides){const r=await action(u,type,payload,overrides);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
 async function next(){for(const u of users)await ok(u,'ready',{});await ok(users[0],'advance');for(const u of users)await refresh(u);}
 try{
  for(let i=0;i<5;i++){const r=await call('/api/session',{});assert.equal(r.status,200);users.push({id:r.data.id,cookie:r.res.headers.get('set-cookie').split(';')[0]});}
  const outsider=users.pop();const created=await call('/api/create',{name:'房主'},users[0].cookie);assert.equal(created.status,200);const code=created.data.code;for(const u of users)u.code=code;
  const joined=await Promise.all(users.slice(1).map((u,i)=>call('/api/join',{code,name:'玩家'+(i+1)},u.cookie)));assert.ok(joined.every(x=>x.status===200));
  assert.equal((await call('/api/join',{code,name:'多余'},outsider.cookie)).status,400);
  assert.equal((await call('/api/state?room='+code,undefined,outsider.cookie)).status,403);
  const evil=await mf.dispatchFetch(origin+'/api/create',{method:'POST',headers:{origin:'https://evil.example',cookie:users[0].cookie},body:'{}'});assert.equal(evil.status,403);
  for(const path of ['/server/case.mjs','/.env','/db/schema.ts','/data/game.sqlite'])assert.equal((await mf.dispatchFetch(origin+path)).status,404);
  for(let i=0;i<4;i++)await ok(users[i],'role',{role:i});
  await refresh(users[0]);const rev=users[0].state.revision;
  const raced=await Promise.all(users.slice(0,2).map(u=>call('/api/action',{room:code,type:'chat',payload:{text:'raced'},requestId:crypto.randomUUID(),expectedRevision:rev},u.cookie)));assert.deepEqual(raced.map(x=>x.status).sort(),[200,409]);
  const requestId=crypto.randomUUID();await ok(users[0],'chat',{text:'ONCE'},{requestId});assert.equal((await ok(users[0],'chat',{text:'ONCE'},{requestId})).duplicate,true);
  await ok(users[0],'chat',{text:'PRIVATE',to:users[1].id});await refresh(users[1]);await refresh(users[2]);assert.ok(users[1].state.messages.some(m=>m.text==='PRIVATE'));assert.ok(!users[2].state.messages.some(m=>m.text==='PRIVATE'));assert.equal(users[0].state.messages.filter(m=>m.text==='ONCE').length,1);
  await ok(users[0],'note',{text:'PRIVATE_NOTE'});await next();assert.equal(users[0].state.phase,1);
  const aiId=crypto.randomUUID();const answer=await ok(users[1],'askAI',{question:'怎么开始'},{requestId:aiId});assert.equal(answer.mode,'rules');const again=await ok(users[1],'askAI',{question:'怎么开始'},{requestId:aiId});assert.equal(again.text,answer.text);assert.equal(again.state.ai.remaining,79);
  await next();await next();const privateIds=['turner-pocket','james-letter','alice-letter','william-note'];
  for(let i=0;i<4;i++){await ok(users[i],'investigate',{targetId:privateIds[i]});for(let j=0;j<4;j++)if(j!==i){await refresh(users[j]);assert.ok(!users[j].state.clues.some(e=>e.id===privateIds[i]));}}
  await next();for(let i=0;i<4;i++)await ok(users[i],'publish',{clueId:privateIds[i]});await next();
  const second=['weapon','route','garment','dossier'];for(let i=0;i<4;i++)await ok(users[i],'investigate',{targetId:second[i]});await next();
  for(const u of users){assert.equal(u.state.chapters.length,3);assert.ok(second.every(id=>u.state.clues.some(e=>e.id===id&&e.public)));assert.equal(u.state.solution,undefined);}
  // Recreate every Worker isolate while retaining the same D1 binding.
  await mf.setOptions({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-07-30',d1Databases:['DB']});db=await mf.getD1Database('DB');await refresh(users[0]);assert.equal(users[0].state.phase,6);assert.equal(users[0].state.me.note,'PRIVATE_NOTE');
  await ok(users[0],'pause');assert.equal((await action(users[1],'ready',{})).status,400);await ok(users[0],'pause');await next();
  for(const u of users)await ok(u,'vote',{suspect:0,method:'凶器、路线、披风及勒索记录',evidence:['weapon','route','garment','dossier']});await ok(users[0],'advance');for(const u of users){await refresh(u);assert.equal(u.state.phase,8);assert.equal(u.state.clues.length,12);assert.equal(u.state.result.correct,true);}
  await db.prepare('UPDATE seats SET seen=? WHERE room=? AND player=?').bind(Date.now()-61000,code,users[0].id).run();await ok(users[1],'claimHost');assert.equal(users[1].state.host,users[1].id);
  const other=await call('/api/create',{name:'另一局'},outsider.cookie);outsider.code=other.data.code;await refresh(outsider);assert.equal(outsider.state.clues.length,0);assert.equal(outsider.state.messages.length,0);
  // Large chat history lives in separate rows, not the room snapshot. Paging remains private.
  const statements=Array.from({length:600},(_,i)=>db.prepare('INSERT INTO messages(id,room,sender,recipient,body,at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),code,users[0].id,i%2?users[1].id:null,'测'.repeat(1200),Date.now()+i));for(let i=0;i<600;i+=50)await db.batch(statements.slice(i,i+50));
  await refresh(users[2]);assert.ok(users[2].state.messageCount>=300);assert.equal(users[2].state.messages.length,100);const history=await ok(users[2],'history',{before:users[2].state.messageCount-100});assert.ok(history.messages.every(m=>!m.to||m.to===users[2].id));
  await ok(users[1],'note',{text:'After large chat history'});const row=await db.prepare('SELECT body FROM rooms WHERE code=?').bind(code).first();assert.ok(new TextEncoder().encode(row.body).length<100000);assert.equal(JSON.parse(row.body).messages.length,0);
 }finally{await mf.dispose();}
});
