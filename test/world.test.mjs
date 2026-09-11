import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENES,EVIDENCE_SPOTS,spawn,walkable,clearPath,stepPosition} from '../public/world-map.js';
import {createRoom,join} from '../server/game.mjs';
import {moveWorld,worldState,validateSpatialAction,placeBot} from '../server/world.mjs';
import {runtime} from '../tools/runtime.mjs';
import '../tools/build.mjs';
test('map: valid spawns, evidence and doors; collision, boundary and normalized diagonal',()=>{
 for(let phase=0;phase<9;phase++)for(let i=0;i<4;i++){const p=spawn(phase,i);assert.ok(walkable(p.scene,p.x,p.y));}
 for(const [scene,s] of Object.entries(SCENES)){assert.ok(walkable(scene,...s.spawn));for(const d of s.doors){assert.ok(SCENES[d.to]);assert.ok(walkable(scene,d.x,d.y));}for(const [x,y,w,h] of s.walls)assert.ok(!walkable(scene,x+w/2,y+h/2));}
 for(const p of Object.values(EVIDENCE_SPOTS))assert.ok(walkable(p.scene,p.x,p.y));
 assert.ok(!walkable('hall',NaN,50));assert.ok(!walkable('no-scene',100,100));assert.ok(!walkable('hall',20,100));assert.ok(!clearPath('hall',{x:200,y:220},{x:560,y:220}));
 const p=spawn(0),q=stepPosition(p,1,1,.05);assert.ok(Math.abs(Math.hypot(q.x-p.x,q.y-p.y)-8)<.001);
});
test('D1 spatial authority: paths, speed, phase, capacity race, proximity and private recipient',async()=>{
 const {mf,db}=await runtime();try{
 const r=createRoom('WORLD1','a','A');join(r,'b','B');join(r,'c','C');r.phase=3;
 await db.prepare('INSERT INTO rooms(code,host,phase,revision,body) VALUES(?,?,?,?,?)').bind(r.code,r.host,r.phase,r.revision,JSON.stringify(r)).run();
 const move=(id,data)=>moveWorld(db,r,id,{phase:r.phase,seq:1,...data});
 await assert.rejects(move('a',{type:'move',path:[{x:720,y:368}]}),/移动过快/);
 await assert.rejects(move('a',{type:'move',path:[{x:768,y:480}]}),/边界/);
 await assert.rejects(move('a',{phase:2,type:'move',path:[{x:324,y:368}]}),/阶段/);
 await assert.rejects(move('a',{type:'door',target:'bank'}),/走近/);
 await assert.rejects(validateSpatialAction(db,r,'a','investigate',{targetId:'weapon'}),/证据旁/);
 assert.equal(r.players[0].clues.length,0);
 await move('a',{type:'move',path:[{x:340,y:368}]});
 // Responses may arrive together after network delay; they share one finite distance budget.
 await move('a',{seq:2,type:'move',path:[{x:440,y:368}]});await move('a',{seq:3,type:'move',path:[{x:540,y:368}]});
 await db.prepare('UPDATE positions SET credit=0,moved_at=? WHERE room=? AND player=?').bind(Date.now()+10000,r.code,'a').run();
 await assert.rejects(move('a',{seq:4,type:'move',path:[{x:700,y:368}]}),/移动过快/);

 await assert.rejects(move('a',{type:'move',path:[{x:341,y:368}]}),/序号/);
 for(const id of ['a','b','c'])await placeBot(db,r,id,'hall',48,144);
 const outcomes=await Promise.allSettled(['a','b','c'].map(id=>move(id,{type:'door',target:'meeting-a',seq:10})));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2);
 const world=await worldState(db,r),inside=world.players.filter(p=>p.scene==='meeting-a'),outside=world.players.find(p=>p.scene!=='meeting-a');
 const payload={text:'secret'};await validateSpatialAction(db,r,inside[0].id,'chat',payload);assert.equal(payload.to,inside[1].id);assert.equal(payload.scene,'meeting-a');
 await assert.rejects(validateSpatialAction(db,r,inside[0].id,'chat',{text:'bad',to:outside.id}),/另一位/);
 await assert.rejects(validateSpatialAction(db,r,outside.id,'chat',{text:'bad',to:inside[0].id}),/私聊需要/);
 await db.prepare('UPDATE positions SET seen=? WHERE room=? AND player=?').bind(Date.now()-21000,r.code,inside[1].id).run();
 await assert.rejects(validateSpatialAction(db,r,inside[0].id,'chat',{text:'alone'}),/没有另一位/);
 const spot=EVIDENCE_SPOTS.weapon;await placeBot(db,r,'a',spot.scene,spot.x,spot.y);await validateSpatialAction(db,r,'a','investigate',{targetId:'weapon'});
 r.phase=4;assert.ok((await worldState(db,r)).players.every(p=>p.scene==='hall'));r.paused=true;await assert.rejects(move('a',{seq:100,type:'move',path:[{x:340,y:368}]}),/暂停/);
 }finally{await mf.dispose();}
});


test('HTTP signaling rejects outsiders and spoofing; recipient scope and expiry',async()=>{
 const {mf,db}=await runtime();const origin='http://localhost';
 async function call(path,data,cookie){const response=await mf.dispatchFetch(origin+path,{method:data===undefined?'GET':'POST',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 try{
 const users=[];for(let i=0;i<3;i++){const s=await call('/api/session',{});users.push({id:s.value.id,cookie:s.cookie});}
 const code=(await call('/api/create',{name:'signal'},users[0].cookie)).value.code;await call('/api/join',{code,name:'receiver'},users[1].cookie);
 const signal={room:code,to:users[1].id,epoch:'valid',description:{type:'offer',sdp:'TEST_SDP'}};
 assert.equal((await call('/api/world',{room:code},undefined)).status,401);
 assert.equal((await call('/api/signal',signal,users[2].cookie)).status,403);
 assert.equal((await call('/api/signal',{...signal,to:users[2].id},users[0].cookie)).status,403);
 assert.equal((await call('/api/signal',{...signal,description:{type:'offer',sdp:'x'.repeat(12001)}},users[0].cookie)).status,400);
 assert.equal((await call('/api/signal',{...signal,sender:users[2].id},users[0].cookie)).status,200);
 let state=(await call('/api/state?room='+code,undefined,users[1].cookie)).value.state;assert.equal(state.signals[0].sender,users[0].id);
 assert.equal((await call('/api/state?room='+code,undefined,users[0].cookie)).value.state.signals.length,0);
 await db.prepare('UPDATE signals SET at=? WHERE room=?').bind(Date.now()-61000,code).run();assert.equal((await call('/api/state?room='+code,undefined,users[1].cookie)).value.state.signals.length,0);
 }finally{await mf.dispose();}
});
