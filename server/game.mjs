import { CASE } from './case.mjs';

export const PHASES = [
  {key:'lobby',name:'围桌准备',minutes:0,guide:'邀请四位朋友，各自选择一个角色。准备后由房主开场。'},
  {key:'read',name:'第一幕 · 身份与秘密',minutes:8,guide:'阅读自己的角色本。可以隐瞒个人秘密，但不可伪造系统证据。读完点准备。'},
  {key:'intro',name:'第二幕 · 开场陈述',minutes:6,guide:'每人介绍身份和自己愿意公开的案发经历。请在公聊发言或使用你们的语音通话。'},
  {key:'search1',name:'第三幕 · 初次搜证',minutes:10,guide:'每人有三次调查机会。先检查你的个人线索，再选择公共地点。证据默认私密，可主动公开。'},
  {key:'discuss',name:'第四幕 · 交换与质询',minutes:10,guide:'分享发现、核对时间。每人至少公开一张第一轮证据后才能结束本幕，保证关键证据不会永久被扣留。'},
  {key:'search2',name:'第五幕 · 深入调查',minutes:10,guide:'每人获得两次深入调查机会。四份复核材料都收集后进入最终陈述；不必依赖单个人坦白。'},
  {key:'statement',name:'第六幕 · 最终陈述',minutes:8,guide:'第二轮证据已归入公共卷宗。按时间、手段和动机梳理推理，每人说明结论并给嫌疑人辩解机会。'},
  {key:'vote',name:'第七幕 · 秘密指控',minutes:4,guide:'选择嫌疑人，填写理由，引用你能看到的证据。投票截止前可修改；全部投票或计时结束后房主结算。'},
  {key:'reveal',name:'终幕 · 真相与余波',minutes:0,guide:'查看完整真相与证据链。平票表示未形成一致指控；个人推理记录仍保留。'},
];
export class RuleError extends Error {}
const fail = message => { throw new RuleError(message); };
const text = (v,max=1000) => typeof v==='string' && v.trim() && v.trim().length<=max ? v.trim() : fail('文字为空或超过长度限制');
const member = (r,id) => r.players.find(p=>p.id===id) ?? fail('你不在这个房间');
const evidence = id => CASE.evidence.find(e=>e.id===id);
const isHost = (r,id) => r.host===id || fail('只有房主可以执行');
export function createRoom(code,id,name) {
  return {code,caseId:CASE.id,revision:0,host:id,phase:0,deadline:null,paused:false,remaining:null,players:[{id,name:text(name,24),role:null,ready:false,clues:[],ap:0,note:'',vote:null}],published:[],messages:[],requests:{},aiCount:0,createdAt:Date.now()};
}
export function join(r,id,name) {
  if(r.players.some(p=>p.id===id)) return;
  if(r.phase!==0) fail('游戏已开始，不能加入新角色');
  if(r.players.length>=CASE.roles.length) fail('房间已满');
  r.players.push({id,name:text(name,24),role:null,ready:false,clues:[],ap:0,note:'',vote:null});
}
function enter(r,index) {
  r.phase=index;
  r.paused=false;
  r.remaining=null;
  r.deadline=PHASES[index].minutes ? Date.now()+PHASES[index].minutes*60000 : null;
  for(const p of r.players) { p.ready=false; p.ap=index===3?3:index===5?2:0; }
  if(index===6) for(const e of CASE.evidence.filter(e=>e.round===2)) if(!r.published.includes(e.id)) r.published.push(e.id);
}
export function advanceProblem(r) {
  if(r.phase===8) return '本局已结束';
  if(r.paused) return '请先恢复游戏';
  if(r.players.some(p=>p.botTask?.until>Date.now())) return '请等待 AI 玩家完成当前回复';
  if(r.phase===0 && (r.players.length!==CASE.roles.length || r.players.some(p=>p.role===null))) return '需要四位玩家各自选择不同角色';
  if(r.phase===3 && r.players.some(p=>!p.clues.some(id=>evidence(id).owner===p.role && evidence(id).round===1))) return '每位玩家须完成自己的个人调查';
  if(r.phase===4 && r.players.some(p=>!(p.shared||[]).some(id=>evidence(id).round===1))) return '每位玩家至少亲自公开一张第一轮证据';
  if(r.phase===5 && CASE.evidence.filter(e=>e.round===2).some(e=>!r.players.some(p=>p.clues.includes(e.id)))) return '请合作收齐四份第二轮复核材料';
  const expired=r.deadline && Date.now()>=r.deadline;
  if(r.phase===7) return r.players.every(p=>p.vote) || expired ? null : '等待所有人提交指控，或等待计时结束';
  if(!r.players.every(p=>p.ready) && !expired) return '等待全员准备，或等待计时结束';
  return null;
}
export function act(r,id,type,payload={}) {
  const p=member(r,id);
  if(!payload || typeof payload!=='object' || Array.isArray(payload)) fail('无效操作参数');
  if(r.paused && !['pause','extend','chat','note','claimHost'].includes(type)) fail('游戏暂停中');
  if(type==='setBot') {
    isHost(r,id);
    if(r.phase!==0) fail('请在开局前设置 AI 角色');
    if(!Number.isInteger(payload.role)||!CASE.roles[payload.role]||typeof payload.enabled!=='boolean') fail('无效 AI 角色设置');
    const owner=r.players.find(q=>q.role===payload.role);
    if(payload.enabled){
      if(owner) fail('角色已有人选择，请先让出角色');
      if(r.players.length>=CASE.roles.length) fail('房间已满');
      r.players.push({id:'bot-'+crypto.randomUUID(),name:CASE.roles[payload.role].name,role:payload.role,bot:true,ready:true,clues:[],ap:0,note:'',vote:null});
    }else{
      if(!owner?.bot) fail('这个角色不是 AI 玩家');
      r.players=r.players.filter(q=>q.id!==owner.id);
    }
  } else if(type==='role') {
    if(r.phase!==0) fail('开局后不能换角色');
    if(!Number.isInteger(payload.role) || !CASE.roles[payload.role]) fail('角色不存在');
    if(r.players.some(q=>q.id!==id && q.role===payload.role)) fail('角色已被选择');
    p.role=payload.role;p.ready=false;
  } else if(type==='ready') {
    if(p.role===null || r.phase>=8) fail('当前不能准备');
    p.ready=payload.value!==false;
  } else if(type==='advance') {
    isHost(r,id);
    const problem=advanceProblem(r);if(problem) fail(problem);
    enter(r,r.phase+1);
  } else if(type==='pause') {
    isHost(r,id);if(r.phase===0 || r.phase===8) fail('当前阶段不能暂停');
    if(!r.paused){r.remaining=Math.max(0,r.deadline-Date.now());r.deadline=null;r.paused=true;}
    else {r.deadline=Date.now()+r.remaining;r.remaining=null;r.paused=false;}
  } else if(type==='extend') {
    isHost(r,id);if(!r.deadline && !r.paused) fail('当前没有计时');
    if(r.paused) r.remaining+=300000; else r.deadline+=300000;
  } else if(type==='investigate') {
    if(![3,5].includes(r.phase)) fail('当前不是搜证阶段');
    const e=evidence(payload.targetId);
    if(!e || e.round!==(r.phase===3?1:2) || (e.owner!==null && e.owner!==p.role)) fail('调查对象不可用');
    if(r.phase===3 && e.owner===null && !p.clues.some(id=>evidence(id).owner===p.role)) fail('请先完成你的个人调查，再选择公共地点');
    if(r.phase===5 && r.players.some(q=>q.clues.includes(e.id))) fail('队友已经取得这份复核材料，请选择另一份');
    if(p.clues.includes(e.id)) fail('你已经调查过这里');
    if(p.ap<1) fail('调查机会已用完');
    p.ap--;p.clues.push(e.id);p.ready=false;
  } else if(type==='publish') {
    if(r.phase<3 || r.phase>=8 || !p.clues.includes(payload.clueId)) fail('不能公开这条证据');
    if(!r.published.includes(payload.clueId)) r.published.push(payload.clueId);
    p.shared||=[];if(!p.shared.includes(payload.clueId))p.shared.push(payload.clueId);
  } else if(type==='chat') {
    const body=text(payload.text,1200);
    const to=payload.to?member(r,payload.to).id:null;
    if(to===id) fail('不能私聊自己');
    if(r.messages.length>=5000) fail('本局消息上限已到达');
    r.messages.push({id:crypto.randomUUID(),from:id,to,text:body,at:Date.now()});
  } else if(type==='note') {p.note=typeof payload.text==='string' && payload.text.length<=5000 ? payload.text : fail('笔记超长');
  } else if(type==='vote') {
    if(r.phase!==7 || (r.deadline && Date.now()>=r.deadline)) fail('不在投票开放时间');
    if(!Number.isInteger(payload.suspect) || !CASE.roles[payload.suspect]) fail('请选择嫌疑人');
    if(!Array.isArray(payload.evidence) || payload.evidence.length>CASE.evidence.length || payload.evidence.some(e=>!p.clues.includes(e)&&!r.published.includes(e))) fail('只能引用你已知的证据');
    p.vote={suspect:payload.suspect,method:text(payload.method,1200),evidence:[...new Set(payload.evidence)]};
  } else fail('未知操作');
}
export function view(r,id,online=[]) {
  const p=member(r,id), known=r.phase===8?CASE.evidence.map(e=>e.id):[...new Set([...p.clues,...r.published])];
  const chapters=p.role===null?[]:CASE.roles[p.role].chapters.filter(c=>c.phase<=r.phase);
  const counts=CASE.roles.map((_,i)=>r.players.filter(q=>q.vote?.suspect===i).length);
  const max=Math.max(...counts), winners=counts.map((n,i)=>n===max?i:-1).filter(i=>i>=0);
  return {
    code:r.code,revision:r.revision,host:r.host,phase:r.phase,stage:PHASES[r.phase],phases:PHASES.map(({key,name})=>({key,name})),deadline:r.deadline,paused:r.paused,remaining:r.remaining,serverTime:Date.now(),
    case:{id:CASE.id,title:CASE.title,subtitle:CASE.subtitle,intro:CASE.intro,source:CASE.source},
    roles:CASE.roles.map(({name,publicBio},i)=>({id:i,name,publicBio})),
    players:r.players.map(q=>({id:q.id,name:q.name,role:q.role,bot:Boolean(q.bot),thinking:q.botTask?.until>Date.now(),ready:q.ready,online:q.bot||online.includes(q.id),voted:Boolean(q.vote)})),
    me:{id:p.id,name:p.name,role:p.role,ap:p.ap,note:p.note,vote:p.vote,shared:p.shared||[],goal:r.phase>0&&p.role!==null?CASE.roles[p.role].goal:null},chapters,
    clues:CASE.evidence.filter(e=>known.includes(e.id)).map(({id,title,body,round})=>({id,title,body,round,public:r.published.includes(id),owned:p.clues.includes(id)})),
    targets:[3,5].includes(r.phase)?CASE.evidence.filter(e=>e.round===(r.phase===3?1:2)&&(e.owner===null||e.owner===p.role)).map(e=>{const done=r.phase===5?r.players.some(q=>q.clues.includes(e.id)):p.clues.includes(e.id);return {id:e.id,title:e.target,description:e.description,personal:e.owner!==null,done,available:!r.paused&&p.ap>0&&!done&&(r.phase!==3||e.owner!==null||p.clues.some(id=>evidence(id).owner===p.role))};}):[],
    messages:r.messages.filter(m=>!m.to || m.to===id || m.from===id).slice(-100),
    messageCount:r.messages.filter(m=>!m.to || m.to===id || m.from===id).length,
    advanceProblem:advanceProblem(r),
    ...(r.phase===8?{solution:CASE.solution,result:{counts,winner:max>0&&winners.length===1?winners[0]:null,tie:max>0&&winners.length>1,correct:max>0&&winners.length===1&&winners[0]===CASE.solution.culprit,votes:r.players.map(q=>({player:q.name,role:q.role,vote:q.vote})),outcomes:r.players.map(q=>({role:q.role,label:q.role===CASE.solution.culprit?'逃过唯一最高票指控':'独立指认正确',success:q.role===CASE.solution.culprit?!(max>0&&winners.length===1&&winners[0]===CASE.solution.culprit):q.vote?.suspect===CASE.solution.culprit})),goals:CASE.roles.map((role,i)=>({role:i,text:role.goal,achieved:role.goalEvidence.every(e=>(r.players.find(q=>q.role===i)?.shared||[]).includes(e))}))}}:{}),
  };
}
