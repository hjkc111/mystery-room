import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_PATH?pathToFileURL(process.env.PLAYWRIGHT_PATH).href:'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const pages=[],errors=[];mkdirSync('test-results',{recursive:true});
try {
 for(let i=0;i<4;i++){const c=await browser.newContext({viewport:{width:1366,height:900}});const p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_URL||'http://localhost:4318');await p.locator('#connection').filter({hasText:'身份已就绪'}).waitFor();await p.locator('#name').fill('界面玩家'+i);}
 await pages[0].screenshot({path:'test-results/desktop.png',fullPage:true});
 await pages[0].locator('#create').click();await pages[0].locator('#connection').filter({hasText:'已连接 · 自动同步'}).waitFor();const code=await pages[0].locator('#roomCode').textContent();
 for(let i=1;i<4;i++){await pages[i].locator('#code').fill(code);await pages[i].locator('#joinForm button').click();await pages[i].locator('#connection').filter({hasText:'已连接 · 自动同步'}).waitFor();}
 async function idle(){await new Promise(r=>setTimeout(r,1100));}
 for(let i=0;i<4;i++){await pages[i].locator('#roles article').nth(i).locator('button').click();await pages[i].waitForFunction(i=>document.querySelectorAll('#roles article')[i].querySelector('button').textContent.includes('已选择'),i);}
 let phase=0;async function next(){for(const p of pages){await p.locator('#ready').click();await p.locator('#ready').filter({hasText:'取消准备'}).waitFor();}await pages[0].locator('#advance').click();phase++;for(const p of pages)await p.waitForFunction(phase=>document.querySelector('#phases .current')?.textContent.startsWith((phase+1)+' '),phase);}
 await next();for(const p of pages)assert.equal(await p.locator('#chapters article').count(),1);
 await pages[1].locator('#question').fill('现在怎么进行？');await pages[1].locator('#ask').click();await pages[1].locator('.ai-answer').waitFor();assert.match(await pages[1].locator('.ai-answer').innerText(),/规则主持/);
 await pages[0].locator('#recipient').selectOption({label:'私聊 · 界面玩家1'});await pages[0].locator('#chat').fill('UI_PRIVATE_SENTINEL');await pages[0].locator('#chatForm button').click();await pages[1].locator('#messages').filter({hasText:'UI_PRIVATE_SENTINEL'}).waitFor();assert.ok(!(await pages[2].locator('#messages').innerText()).includes('UI_PRIVATE_SENTINEL'));
 await next();await next();
 for(const p of pages){await p.locator('#targets article').first().locator('button').click();await p.waitForFunction(()=>document.querySelectorAll('#clues article').length===1);assert.equal(await p.locator('#clues article').count(),1);}
 await next();for(const p of pages){assert.equal(await p.locator('#chapters article').count(),2);await p.locator('#clues button').click();await p.waitForFunction(()=>document.querySelectorAll('#clues button').length===0);}
 await next();for(let i=0;i<4;i++){await pages[i].locator('#targets article').nth(i).locator('button').click();await pages[i].locator('#targets article').nth(i).locator('button').filter({hasText:'已调查'}).waitFor();}
 await next();for(const p of pages)assert.equal(await p.locator('#chapters article').count(),3);
 await pages[0].setViewportSize({width:390,height:844});assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await pages[0].screenshot({path:'test-results/mobile-game.png',fullPage:true});
 await next();for(const p of pages){await p.locator('#suspect').selectOption('0');await p.locator('#method').fill('依据凶器、路线、披风和旧案记录指认。');await p.locator('#voteForm button').click();await p.locator('#voteSaved').filter({hasText:'已保存指控'}).waitFor();await idle();}
 await pages[0].locator('#advance').click();for(const p of pages){await p.locator('#ending').waitFor();assert.match(await p.locator('#solution').innerText(),/成功找出凶手/);assert.equal(await p.locator('#clues article').count(),12);}
 await pages[0].setViewportSize({width:1366,height:900});await pages[0].screenshot({path:'test-results/reveal.png',fullPage:true});assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,code,players:4,phases:9,mobileWidth:390,pageErrors:errors}));
} catch(error){for(let i=0;i<pages.length;i++){await pages[i].screenshot({path:'test-results/failure-'+i+'.png',fullPage:true}).catch(()=>{});}throw error;} finally {await browser.close();}
