import test from 'node:test';
import assert from 'node:assert/strict';
import {CASE} from '../server/case.mjs';
import {createRoom,join,act,view,advanceProblem} from '../server/game.mjs';

const privateIds=['turner-pocket','james-letter','alice-letter','william-note'];
const round2=['weapon','route','garment','dossier'];
function table(){const r=createRoom('123ABC','p0','一');for(let i=1;i<4;i++)join(r,'p'+i,'人'+i);for(let i=0;i<4;i++){act(r,'p'+i,'role',{role:i});act(r,'p'+i,'ready',{});}return r;}
function step(r){for(let i=0;i<4;i++)act(r,'p'+i,'ready',{});act(r,'p0','advance',{});}
function toSearch(){const r=table();step(r);step(r);step(r);return r;}

test('independent chapter/evidence matrix for every role at every stage',()=>{
  const r=table();
  for(let phase=0;phase<=8;phase++){
    r.phase=phase;
    for(let i=0;i<4;i++){
      const v=view(r,'p'+i),expected=phase===0?0:phase<4?1:phase<6?2:3;
      assert.equal(v.chapters.length,expected,`role ${i} stage ${phase}`);
      assert.deepEqual(v.chapters,CASE.roles[i].chapters.slice(0,expected));
      if(phase<8)assert.deepEqual(v.clues,[]);else assert.equal(v.clues.length,12);
      assert.equal(Boolean(v.solution),phase===8);
      if(phase===3)assert.deepEqual(v.targets.map(t=>t.id),[privateIds[i],'testimony','lastword','pool','quarrel']);
      else if(phase===5)assert.deepEqual(v.targets.map(t=>t.id),round2);
      else assert.deepEqual(v.targets,[]);
      for(let other=0;other<4;other++)if(other!==i)assert.ok(!JSON.stringify(v).includes(CASE.roles[other].chapters[0].body));
    }
  }
});
test('all clues have unique IDs, correct owners and complete proof references',()=>{
  assert.equal(CASE.roles.length,4);assert.equal(CASE.evidence.length,12);assert.equal(new Set(CASE.evidence.map(e=>e.id)).size,12);
  for(let i=0;i<4;i++)assert.equal(CASE.evidence.find(e=>e.id===privateIds[i]).owner,i);
  for(const id of round2)assert.equal(CASE.evidence.find(e=>e.id===id).round,2);
  for(const proof of CASE.solution.proof)for(const id of proof.ids)assert.ok(CASE.evidence.some(e=>e.id===id));
  assert.equal(CASE.solution.culprit,0);assert.ok(CASE.roles[0].chapters[0].body.includes('你就是杀死查尔斯的人'));
});
test('no foreign clue access, no premature actions, AP preserved on rejection, publishing only owned evidence',()=>{
  const r=table();assert.throws(()=>act(r,'p1','advance',{}));assert.throws(()=>act(r,'p0','investigate',{targetId:'turner-pocket'}));
  step(r);step(r);step(r);
  assert.throws(()=>act(r,'p0','investigate',{targetId:'james-letter'}));assert.equal(r.players[0].ap,3);
  assert.throws(()=>act(r,'p0','investigate',{targetId:'garment'}));
  act(r,'p0','investigate',{targetId:'turner-pocket'});assert.equal(r.players[0].ap,2);
  assert.throws(()=>act(r,'p0','investigate',{targetId:'turner-pocket'}));assert.equal(r.players[0].ap,2);
  assert.deepEqual(view(r,'p1').clues,[]);assert.throws(()=>act(r,'p1','publish',{clueId:'turner-pocket'}));
  act(r,'p0','publish',{clueId:'turner-pocket'});assert.equal(view(r,'p1').clues[0].body,CASE.evidence[0].body);
});
test('full critical evidence cannot be permanently withheld, chapters unlock only at transitions',()=>{
  const r=toSearch();assert.match(advanceProblem(r),/个人调查/);
  for(let i=0;i<4;i++)act(r,'p'+i,'investigate',{targetId:privateIds[i]});step(r);
  assert.match(advanceProblem(r),/至少亲自公开/);
  for(let i=0;i<4;i++)act(r,'p'+i,'publish',{clueId:privateIds[i]});step(r);
  assert.match(advanceProblem(r),/收齐/);
  for(let i=0;i<4;i++)act(r,'p'+i,'investigate',{targetId:round2[i]});step(r);
  for(let i=0;i<4;i++){const v=view(r,'p'+i);for(const id of round2)assert.ok(v.clues.some(e=>e.id===id&&e.public));assert.equal(v.chapters.length,3);}
});
test('secret voting, replacement vote, ties, zero votes and paused deadline',()=>{
  const r=table();r.phase=7;r.deadline=Date.now()+100000;
  act(r,'p0','vote',{suspect:0,method:'推理',evidence:[]});assert.equal(view(r,'p1').players[0].voted,true);assert.ok(!('vote' in view(r,'p1').players[0]));
  act(r,'p0','vote',{suspect:1,method:'修改',evidence:[]});assert.equal(r.players[0].vote.suspect,1);
  for(let i=1;i<4;i++)act(r,'p'+i,'vote',{suspect:i<2?1:0,method:'推理',evidence:[]});
  act(r,'p0','pause',{});assert.throws(()=>act(r,'p0','advance',{}));act(r,'p0','extend',{});assert.ok(r.remaining>300000);act(r,'p0','pause',{});
  act(r,'p0','advance',{});assert.equal(view(r,'p0').result.tie,true);assert.equal(view(r,'p0').result.winner,null);
  const zero=table();zero.phase=7;zero.deadline=Date.now()-1;assert.throws(()=>act(zero,'p0','vote',{suspect:0,method:'太晚',evidence:[]}));act(zero,'p0','advance',{});assert.equal(view(zero,'p0').result.winner,null);assert.equal(view(zero,'p0').result.tie,false);
});
test('private chats and notes never appear in unrelated views',()=>{
  const r=table();act(r,'p0','chat',{text:'PRIVATE_SENTINEL',to:'p1'});act(r,'p0','note',{text:'NOTE_SENTINEL'});
  assert.ok(JSON.stringify(view(r,'p1')).includes('PRIVATE_SENTINEL'));
  for(const id of ['p2','p3'])assert.ok(!JSON.stringify(view(r,id)).includes('PRIVATE_SENTINEL'));
  assert.ok(!JSON.stringify(view(r,'p1')).includes('NOTE_SENTINEL'));
  assert.throws(()=>act(r,'p0','chat',{text:'secret',to:'outsider'}));
});

test('individual sharing is required and side goals are not awarded for automatic public evidence',()=>{
 const r=toSearch();for(let i=0;i<4;i++){act(r,'p'+i,'investigate',{targetId:privateIds[i]});act(r,'p'+i,'investigate',{targetId:'pool'});}step(r);
 act(r,'p0','publish',{clueId:'pool'});assert.match(advanceProblem(r),/每位玩家/);
 for(let i=1;i<4;i++)act(r,'p'+i,'publish',{clueId:'pool'});step(r);
 act(r,'p0','investigate',{targetId:'weapon'});assert.throws(()=>act(r,'p1','investigate',{targetId:'weapon'}));assert.equal(r.players[1].ap,2);
 for(let i=1;i<4;i++)act(r,'p'+i,'investigate',{targetId:round2[i]});step(r);step(r);
 for(let i=0;i<4;i++)act(r,'p'+i,'vote',{suspect:0,method:'复核材料',evidence:['weapon']});act(r,'p0','advance',{});
 const v=view(r,'p0');assert.equal(v.clues.length,12);assert.ok(v.result.goals.every(g=>!g.achieved));assert.equal(v.result.outcomes[0].success,false);assert.ok(v.result.outcomes.slice(1).every(o=>o.success));
});
