import {build} from 'esbuild';
import {readFileSync,mkdirSync,cpSync} from 'node:fs';
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const assets=Object.fromEntries(Object.entries(files).map(([url,[file,type]])=>[url,{body:readFileSync('public/'+file,'utf8'),type}]));
await build({entryPoints:['server/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',plugins:[{name:'assets',setup(b){b.onResolve({filter:/^virtual:assets$/},()=>({path:'assets',namespace:'inline'}));b.onLoad({filter:/.*/,namespace:'inline'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));}}]});
mkdirSync('dist/.openai',{recursive:true});cpSync('.openai/hosting.json','dist/.openai/hosting.json');cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Sites Worker + embedded static assets + D1 migrations built.');
