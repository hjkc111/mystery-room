import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {walk,go,position,closePanels} from './scene-test-helpers.mjs';
import {EVIDENCE_SPOTS} from '../public/world-map.js';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const pages=[],errors=[],metrics={};mkdirSync('test-results',{recursive:true});
try{
 for(let i=0;i<4;i++){const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_URL||'http://127.0.0.1:4318/');await p.locator('#connection').filter({hasText:'身份已就绪'}).waitFor();await p.locator('#name').fill('场景玩家'+i);}
 await pages[0].locator('#create').click();await pages[0].locator('#roomCode').filter({hasText:/[A-Z0-9]{6}/}).waitFor();const code=(await pages[0].locator('#roomCode').innerText()).trim();
 for(let i=1;i<4;i++){await pages[i].locator('#code').fill(code);await pages[i].locator('#joinForm button').click();await pages[i].locator('#world').waitFor();}
 for(let i=0;i<4;i++){await pages[i].locator('#roles article').nth(i).getByRole('button',{name:'选择这个角色',exact:true}).click();await pages[i].waitForFunction(i=>document.querySelectorAll('#roles article')[i].querySelector('button').textContent.includes('已选择'),i);}
 console.log('Four seats joined',code);await pages[0].waitForFunction(()=>window.scene.inspect().peers===3,null,{timeout:30000});
 await pages[0].waitForTimeout(2200);metrics.transport=await pages[0].locator('#realtimeStatus').innerText();
 const id=await pages[0].evaluate(async()=> (await (await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()).id);
 const before=await position(pages[0]);await pages[0].locator('#world').focus();const started=Date.now();await pages[0].keyboard.down('ArrowRight');await pages[1].waitForFunction(({id,x})=>JSON.parse(document.querySelector('#world').dataset.peers).some(p=>p.id===id&&p.x>x+8),{id,x:before.x});metrics.peerMovementMs=Date.now()-started;await pages[0].keyboard.up('ArrowRight');await pages[0].evaluate(()=>window.scene.flush());
 await walk(pages[0],{x:384,y:310});await pages[0].keyboard.down('ArrowUp');await pages[0].waitForTimeout(500);await pages[0].keyboard.up('ArrowUp');assert.ok((await position(pages[0])).y>=298,'table collision');
 const stationary=await position(pages[0]);await pages[0].locator('#chat').fill('wasd');await pages[0].keyboard.type('wasd ');await pages[0].waitForTimeout(150);assert.equal(Math.round((await position(pages[0])).x),Math.round(stationary.x));
 let phase=0;async function next(){for(const p of pages){await closePanels(p);await p.locator('#ready').click();await p.locator('#ready').filter({hasText:'取消准备'}).waitFor();}await pages[0].locator('#advance').click();phase++;for(const p of pages)await p.waitForFunction(n=>document.querySelector('#phases .current')?.textContent.startsWith((n+1)+' '),phase);console.log('Phase',phase);}
 await next();for(const p of pages){assert.equal(await p.locator('#chapters article').count(),1);assert.equal((await position(p)).scene,'reading');}
 await next();await next();
 const first=['turner-pocket','james-letter','alice-letter','william-note'];
 for(let i=0;i<4;i++){const spot=EVIDENCE_SPOTS[first[i]];await go(pages[i],spot.scene);await walk(pages[i],spot);await pages[i].keyboard.press('Space');await pages[i].waitForFunction(()=>document.querySelectorAll('#clues article').length===1);await closePanels(pages[i]);}
 await pages[0].screenshot({path:'test-results/scene-search.png',fullPage:true});
 await next();for(const p of pages){await p.locator('[data-panel=evidencePanel]').click();await p.locator('#clues button').click();await p.waitForFunction(()=>document.querySelectorAll('#clues button').length===0);await closePanels(p);}
 await go(pages[0],'meeting-a');await go(pages[1],'meeting-a');
 await pages[0].locator('#chat').fill('PRIVATE_SCENE_SENTINEL');await pages[0].locator('#chatForm button').click();await pages[1].locator('#messages').filter({hasText:'PRIVATE_SCENE_SENTINEL'}).waitFor();assert.ok(!(await pages[2].locator('#messages').innerText()).includes('PRIVATE_SCENE_SENTINEL'));
 await walk(pages[2],{x:48,y:144});await pages[2].keyboard.press('Space');await pages[2].locator('#notice').filter({hasText:/已满/}).waitFor();assert.equal((await position(pages[2])).scene,'hall');
 await pages[0].screenshot({path:'test-results/scene-private.png',fullPage:true});await go(pages[0],'hall');await pages[2].keyboard.press('Space');await pages[2].waitForFunction(()=>document.querySelector('#world').dataset.scene==='meeting-a');await pages[2].waitForTimeout(600);assert.ok(!(await pages[2].locator('#messages').innerText()).includes('PRIVATE_SCENE_SENTINEL'));
 await next();const second=['weapon','route','garment','dossier'];
 for(let i=0;i<4;i++){const spot=EVIDENCE_SPOTS[second[i]];await go(pages[i],spot.scene);await walk(pages[i],spot);await pages[i].keyboard.press('Space');await pages[i].waitForFunction(()=>document.querySelectorAll('#clues article').length>=5);await closePanels(pages[i]);}
 await next();await pages[0].setViewportSize({width:390,height:844});assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const mobileBefore=await position(pages[0]);await pages[0].locator('[data-move=right]').scrollIntoViewIfNeeded();const buttonBox=await pages[0].locator('[data-move=right]').boundingBox();await pages[0].mouse.move(buttonBox.x+buttonBox.width/2,buttonBox.y+buttonBox.height/2);await pages[0].mouse.down();await pages[0].waitForTimeout(250);await pages[0].mouse.up();assert.ok((await position(pages[0])).x>mobileBefore.x);await pages[0].screenshot({path:'test-results/scene-mobile.png',fullPage:true});
 await next();for(const p of pages){await p.locator('#suspect').selectOption('0');await p.locator('#method').fill('凶器、路线、披风和旧案证据');await p.locator('#voteForm button').click();await p.locator('#voteSaved').filter({hasText:'已保存指控'}).waitFor();}
 await closePanels(pages[0]);await pages[0].locator('#advance').click();for(const p of pages){await p.locator('#ending').waitFor();assert.match(await p.locator('#solution').innerText(),/成功找出凶手/);assert.equal(await p.locator('#clues article').count(),12);}
 await pages[0].setViewportSize({width:1440,height:1000});await pages[0].screenshot({path:'test-results/scene-ending.png',fullPage:true});assert.deepEqual(errors,[]);metrics.passed=true;metrics.code=code;metrics.phases=9;writeFileSync('test-results/scene-metrics.json',JSON.stringify(metrics,null,2));console.log(metrics);
}catch(e){for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:'test-results/scene-failure-'+i+'.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
