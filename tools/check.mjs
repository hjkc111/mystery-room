import {readdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
for(const dir of ['server','public','test','tools'])for(const file of readdirSync(dir))if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'pipe'});
const html=readFileSync('public/index.html','utf8');
assert.ok(html.includes('/app.js')&&html.includes('/style.css'),'HTML must reference delivered assets');
assert.ok(!html.includes('server/case'),'No hidden case in public HTML');
for(const file of readdirSync('public').filter(f=>/\.(html|js|css)$/.test(f)))assert.ok(!readFileSync(`public/${file}`,'utf8').includes('DEEPSEEK_API_KEY='),'No API keys in public assets');
console.log('Source validation passed: JS syntax and static entrypoints.');
