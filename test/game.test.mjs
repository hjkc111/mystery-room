import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, join, act, view, PHASES } from '../server/game.mjs';

test('four independent seats progress through a complete game without leaking role chapters', () => {
  const r = createRoom('ABC123', 'p0', '甲');
  for(let i=1;i<4;i++) join(r,'p'+i,'玩家'+i);
  for(let i=0;i<4;i++) { act(r,'p'+i,'role',{role:i}); act(r,'p'+i,'ready',{}); }
  assert.throws(()=>join(r,'p4','第五人'));
  act(r,'p0','advance',{});
  for(let stage=1; stage<PHASES.length-1;stage++) {
    assert.equal(r.phase,stage);
    for(let i=0;i<4;i++) {
      const v=view(r,'p'+i);
      assert.equal(v.me.role,i);
      assert.ok(v.chapters.length);
      assert.equal(v.solution,undefined);
      assert.ok(v.players.every(p=>!('chapters' in p) && !('token' in p)));
      const targets=v.targets.filter(t=>t.available);
      if(stage===3) for(const target of targets.slice(0,3)) act(r,'p'+i,'investigate',{targetId:target.id});
      if(stage===4) act(r,'p'+i,'publish',{clueId:r.players[i].clues[0]});
      if(stage===5) act(r,'p'+i,'investigate',{targetId:['weapon','route','garment','dossier'][i]});
      if(PHASES[stage].key==='vote') act(r,'p'+i,'vote',{suspect:0,method:'根据证据作出判断',evidence:[]});
      act(r,'p'+i,'ready',{});
    }
    act(r,'p0','advance',{});
  }
  assert.ok(view(r,'p0').solution);
});
