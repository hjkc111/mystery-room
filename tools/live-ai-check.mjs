import {chromium} from 'playwright';
import assert from 'node:assert/strict';
if(!process.env.TEST_URL)throw new Error('请显式设置TEST_URL；此手动检查会创建房间并调用真实AI。');
const b=await chromium.launch({channel:'chrome',headless:true});const pages=[];
try{
 for(let i=0;i<4;i++){const p=await(await b.newContext()).newPage();pages.push(p);await p.goto(process.env.TEST_URL);await p.locator('#connection').filter({hasText:'身份已就绪'}).waitFor();await p.locator('#name').fill('AI验收'+i);}
 await pages[0].locator('#create').click();await pages[0].locator('#connection').filter({hasText:'已连接 · 自动同步'}).waitFor();const code=await pages[0].locator('#roomCode').textContent();
 for(let i=1;i<4;i++){await pages[i].locator('#code').fill(code);await pages[i].locator('#joinForm button').click();await pages[i].locator('#connection').filter({hasText:'已连接 · 自动同步'}).waitFor();}
 for(let i=0;i<4;i++){await pages[i].locator('#roles article').nth(i).locator('button').click();await pages[i].waitForFunction(i=>document.querySelectorAll('#roles article')[i].querySelector('button').textContent.includes('已选择'),i);}
 for(const p of pages){await p.locator('#ready').click();await p.locator('#ready').filter({hasText:'取消准备'}).waitFor();}
 await pages[0].locator('#advance').click();await pages[1].waitForFunction(()=>document.querySelector('#phases .current')?.textContent.startsWith('2 '));
 const p=pages[1];assert.match(await p.locator('#aiStatus').innerText(),/已配置/);await p.locator('#question').fill('我们刚进入角色阅读阶段，请用两句话告诉我接下来怎么参与，不要推理凶手。');const started=Date.now();
 const response=p.waitForResponse(r=>r.url().endsWith('/api/action')&&r.request().postDataJSON()?.type==='askAI'&&r.status()===200);
 await p.locator('#ask').click();const result=await(await response).json();await p.locator('.ai-answer').waitFor();assert.equal(result.mode,'ai');assert.ok(result.text.length>10);assert.match(await p.locator('.ai-answer .tag').innerText(),/AI 主持回复/);
 console.log(JSON.stringify({passed:true,mode:result.mode,model:result.model,reply:result.text,elapsedMs:Date.now()-started}));
}finally{await b.close();}
