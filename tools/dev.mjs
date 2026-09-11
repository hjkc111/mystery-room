import './build.mjs';
import {runtime} from './runtime.mjs';
const keys=['DEEPSEEK_API_KEY','AI_BASE_URL','AI_MODEL','AI_TIMEOUT_MS','AI_MAX_TOKENS','AI_ROOM_BUDGET'];
const {mf}=await runtime({persist:'./data/worker',port:Number(process.env.PORT||4319),bindings:Object.fromEntries(keys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]))});
console.log('Sites-compatible preview: '+await mf.ready);
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await mf.dispose();process.exit(0);});
