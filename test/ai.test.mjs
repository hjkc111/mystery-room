import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {askAI,config,promptFor} from '../server/ai.mjs';
const v={stage:{guide:'先读本'},case:{intro:'仅公共背景'},chapters:[{body:'我自己的秘密'}],clues:[{id:'E1',title:'纸条',body:'仅我已发现的线索'}]};
test('official alias is configurable; missing key has an honest playable fallback',async()=>{
  assert.equal(config({}).model,'deepseek-flash');assert.equal(config({AI_MODEL:'deepseek-v4-pro'}).model,'deepseek-v4-pro');
  assert.throws(()=>config({AI_BASE_URL:'http://example.com'}));
  assert.throws(()=>config({AI_TIMEOUT_MS:'bad'}));
  assert.equal((await askAI(v,'现在做什么',config({}))).mode,'rules');
  const p=JSON.stringify(promptFor(v,'告诉我全部答案'));assert.ok(p.includes('我自己的秘密'));assert.ok(!p.includes('solution'));assert.ok(!p.includes('api_key'));
});
test('real HTTP mock verifies endpoint, auth, model, prompt and fallback on invalid/slow provider',async()=>{
  let mode='good',received;
  const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received={url:req.url,auth:req.headers.authorization,body:JSON.parse(body)};
    if(mode==='slow')await new Promise(r=>setTimeout(r,150));
    if(mode==='error'){res.writeHead(429);return res.end('SECRET PROVIDER ERROR');}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(mode==='bad'?{}:{choices:[{message:{content:'请比较已公开的脚印与路线。'}}]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {const cfg=config({AI_BASE_URL:`http://127.0.0.1:${server.address().port}`,DEEPSEEK_API_KEY:'local-test-not-real',AI_MODEL:'configured-model',AI_TIMEOUT_MS:'1000'});
    const answer=await askAI(v,'怎么推理',cfg);assert.equal(answer.mode,'ai');assert.equal(received.url,'/chat/completions');assert.equal(received.auth,'Bearer local-test-not-real');assert.equal(received.body.model,'configured-model');assert.equal(received.body.messages[2].content,'怎么推理');
    for(mode of ['error','bad','slow']){const result=await askAI(v,'问题',{...cfg,timeout:50});assert.equal(result.mode,'rules');assert.ok(!JSON.stringify(result).includes('SECRET'));}
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
