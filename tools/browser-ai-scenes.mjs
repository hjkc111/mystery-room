import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright';
import {runtime} from './runtime.mjs';
import {go,walk,closePanels} from './scene-test-helpers.mjs';
import {EVIDENCE_SPOTS} from '../public/world-map.js';
const provider=http.createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({text:'SCENE_AI_REPLY',vote:{suspect:0,method:'结合证据指控',evidence:[]}})}}]}));});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));const {mf}=await runtime({bindings:{DEEPSEEK_API_KEY:'test-only',AI_BASE_URL:'http://127.0.0.1:'+provider.address().port}});const origin=(await mf.ready).origin;
const browser=await chromium.launch({channel:'chrome',headless:true}),p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(origin);await p.locator('#connection').filter({hasText:'身份已就绪'}).waitFor();await p.locator('#name').fill('AI场景房主');await p.locator('#autonomousNpc').uncheck();await p.locator('#create').click();await p.locator('#roles article').first().getByRole('button',{name:'选择这个角色',exact:true}).click();
 for(let i=1;i<4;i++){await p.locator('#roles article').nth(i).getByRole('button',{name:'设为 AI 玩家',exact:true}).click();await p.locator('#roles article').nth(i).getByRole('button',{name:'移除 AI 玩家',exact:true}).waitFor();}
 async function advance(){await closePanels(p);await p.locator('#ready').click();await p.locator('#ready').filter({hasText:'取消准备'}).waitFor();await p.locator('#advance').click();}
 await advance();for(let phase=1;phase<=7;phase++){
  await p.waitForFunction(n=>document.querySelector('#phases .current')?.textContent.startsWith((n+1)+' '),phase);await closePanels(p);
  if(phase===3){await go(p,'meeting-a');await p.locator('#aiInvites button').first().click();await p.waitForFunction(()=>JSON.parse(document.querySelector('#world').dataset.peers).length===2);await p.locator('#chat').fill('请只根据你目前的材料告诉我你的看法');await p.locator('#chatForm button').click();await p.locator('#messages .private').filter({hasText:'SCENE_AI_REPLY'}).waitFor();await p.screenshot({path:'test-results/scene-ai-private.png',fullPage:true});await go(p,'garden');await walk(p,EVIDENCE_SPOTS['turner-pocket']);await p.keyboard.press('Space');await p.locator('#clues article').waitFor();await closePanels(p);}
  if(phase===4){await p.locator('[data-panel=evidencePanel]').click();await p.locator('#clues button').first().click();await p.waitForFunction(()=>document.querySelectorAll('#clues button').length===0);await closePanels(p);}
  if(phase===5){await go(p,'bank');await walk(p,EVIDENCE_SPOTS.weapon);await p.keyboard.press('Space');await p.waitForFunction(()=>document.querySelectorAll('#clues article').length>=5);await closePanels(p);}
  for(let i=0;i<3;i++){const card=p.locator('#players .player').nth(i+1);await card.getByRole('button',{name:'让 AI 完成本幕',exact:true}).click();await p.waitForFunction(i=>/已准备|已提交指控/.test(document.querySelectorAll('#players .player')[i+1].innerText),i);}
  if(phase===7){await p.locator('[data-panel=votePanel]').click();await p.locator('#suspect').selectOption('0');await p.locator('#method').fill('核对全套证据');await p.locator('#voteForm button').click();await p.locator('#voteSaved').filter({hasText:'已保存'}).waitFor();await closePanels(p);await p.locator('#advance').click();}else await advance();
 }
 await p.locator('#ending').waitFor();assert.match(await p.locator('#solution').innerText(),/成功找出凶手/);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,humans:1,bots:3,phases:9,provider:'local deterministic mock',privateInvite:true}));
}catch(e){await p.screenshot({path:'test-results/scene-ai-failure.png',fullPage:true});throw e;}finally{await browser.close();await mf.dispose();provider.closeAllConnections();await new Promise(r=>provider.close(r));}
