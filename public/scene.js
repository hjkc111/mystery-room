import {SCENES,EVIDENCE_SPOTS,WIDTH,HEIGHT,TILE,REACH,spawn,allowedScenes,privateScene,distance,stepPosition} from './world-map.js';
import {Realtime} from './realtime.js';
import {updateGames,openGames,npcCommand} from './games.js';
window.npcCommand=npcCommand;
const $=id=>document.getElementById(id),canvas=$('world');let ctx=canvas.getContext('2d');
let state=null,local=null,seq=0,keys=new Set(),path=[],sending=null,lastFrame=0,lastPose=0,lastSave=0,lastPath=0,online=true,peerSync=false,selectedPanel=null,interaction=null;
const motion=localStorage.getItem('mystery-motion');let reducedMotion=motion===null?matchMedia('(prefers-reduced-motion: reduce)').matches:motion==='reduced';
const preferences=document.createElement('label');preferences.className='small';const reduce=document.createElement('input');reduce.type='checkbox';reduce.checked=reducedMotion;reduce.onchange=()=>{reducedMotion=reduce.checked;localStorage.setItem('mystery-motion',reducedMotion?'reduced':'full');};preferences.append(reduce,document.createTextNode(' 减少动态'));document.querySelector('.scene-toolbar').append(preferences);
const peers=new Map(),colors=['#e9be78','#79c6d1','#d9a7cc','#9ccb88'];
const atlas=new Image(),characters=new Image();atlas.src='/assets/world.png';characters.src='/assets/characters.png';
const manor=new Image();manor.src='/assets/manor-characters.png';
const furnishings=new Image();furnishings.src='/assets/manor-furnishings.png';
const terrain=new Image();terrain.src='/assets/manor-terrain.png';
const roomSurfaces=new Map();for(const img of [atlas,furnishings,terrain])img.addEventListener('load',()=>roomSurfaces.clear());
const poses=[[[109,69,136,245],[410,69,123,243],[709,63,129,249],[1003,66,144,247]],[[132,363,97,252],[415,362,113,252],[722,361,120,254],[1031,360,102,255]],[[107,656,138,245],[410,656,123,245],[708,653,132,248],[1001,653,151,248]],[[121,942,99,254],[415,942,113,254],[702,942,127,255],[1020,942,106,255]]];
const facing=new Map(),lastDrawn=new Map();
Promise.all([atlas.decode(),characters.decode(),manor.decode(),furnishings.decode(),terrain.decode()]).then(()=>{$('sceneLoading').hidden=true;canvas.dataset.artReady='true';}).catch(()=>$('sceneLoading').textContent='素材加载失败，请刷新页面重试');
async function api(url,data){const res=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});const value=await res.json();if(!res.ok)throw new Error(value.error||'场景同步失败');return value;}
const rtc=new Realtime({api,onPose:(id,p)=>peers.set(id,{...p,at:performance.now()}),onInvalidate:()=>window.refreshGame?.(),onStatus:s=>{$('realtimeStatus').textContent=!online?'连接中断 · 正在恢复':`${s.mode==='WebRTC'?`实时直连 ${s.channels} 人`:'服务器同步'}${s.rtt===null?'':` · RTT ${s.rtt} ms`}`;canvas.dataset.transport=s.mode;canvas.dataset.rtt=s.rtt??'';}});
function resetPosition(p){local={...p};seq=p.seq||0;path=[];}
function update(v){
 const changedRoom=state?.code!==v.code,changedPhase=state?.phase!==v.phase;state=v;
 const p=v.world.players.find(p=>p.id===v.me.id);
 if(!local||changedRoom||changedPhase||p.scene!==local.scene){resetPosition(p);keys.clear();peers.clear();}
 else {seq=Math.max(seq,p.seq);if(!sending&&!path.length&&distance(local,p)>40)resetPosition(p);}
 if(!peerSync){peerSync=true;rtc.sync(v).finally(()=>peerSync=false);}
 $('sceneName').textContent=SCENES[local.scene].name;
 $('chatTitle').textContent=privateScene(local.scene)?'会客室 · 双人私聊':SCENES[local.scene].name+' · 现场讨论';
 document.querySelectorAll('#players .location-label').forEach((el,i)=>{const pos=v.world.players.find(p=>p.id===v.players[i].id);el.textContent=SCENES[pos.scene].name;});
 const others=v.world.players.filter(p=>p.scene===local.scene&&p.id!==v.me.id);
 $('scenePeople').textContent='同场景：'+(others.map(p=>v.players.find(q=>q.id===p.id)?.name).join('、')||'暂无其他玩家')+([3,5].includes(v.phase)?` · 剩余 ${v.me.ap} 次调查`:'');
 const inviteKey=JSON.stringify([local.scene,others.map(p=>p.id),v.players.map(p=>[p.id,p.bot])]);
 if($('aiInvites').dataset.key!==inviteKey){$('aiInvites').dataset.key=inviteKey;$('aiInvites').replaceChildren();if(privateScene(local.scene)&&!others.length)for(const b of v.players.filter(p=>p.bot)){const button=document.createElement('button');button.textContent='邀请 '+b.name;button.onclick=()=>v.settings.autonomousNpc?npcCommand('invite',b.id):worldAction('inviteBot',{playerId:b.id});$('aiInvites').append(button);}}
 if(changedPhase){selectedPanel=null;if(v.phase===1)showPanel('book');else if(v.phase===7)showPanel('votePanel');else if(v.phase===8)showPanel('ending');}
 applyPanels();online=true;updateGames(v);
}
async function flush(){
 if(sending){await sending;if(path.length)return flush();return;}
 if(!state||!local||!path.length)return;
 if(distance(path.at(-1),local)>.01)path.push({x:local.x,y:local.y});const batch=path;path=[];const phase=state.phase,room=state.code;
 sending=(async()=>{try{const r=await api('/api/world',{room,type:'move',phase,seq:++seq,path:batch});if(state?.phase!==phase||state?.code!==room)return;const p=r.world.players.find(p=>p.id===state.me.id);seq=Math.max(seq,p.seq);online=true;}catch(e){if(state?.phase!==phase||state?.code!==room)return;path=[];online=false;keys.clear();local=null;window.gameNotice?.(e.message);window.refreshGame?.();throw e;}finally{sending=null;}})();
 return sending;
}
async function worldAction(type,payload={}){
 try{await flush();if(!state||!local)return;const r=await api('/api/world',{room:state.code,type,phase:state.phase,seq:++seq,...payload});resetPosition(r.world.players.find(p=>p.id===state.me.id));rtc.pose(local);rtc.invalidate();await window.refreshGame?.();canvas.focus();}catch(e){window.gameNotice?.(e.message);}
}
async function interact(){if(!interaction||!state||state.paused)return;const target=interaction;try{await flush();if(target.kind==='games'){openGames();return;}if(target.kind==='door')await worldAction('door',{target:target.id});else if(target.available)await window.sendGame?.('investigate',{targetId:target.id},()=>showPanel('evidencePanel'));else window.gameNotice?.('此线索已调查或当前没有调查机会');}catch{}}
function showPanel(id){selectedPanel=selectedPanel===id?null:id;applyPanels();}
function applyPanels(){for(const id of ['book','evidencePanel','hostPanel','notesPanel','votePanel','ending','discussionPanel']){if(id==='discussionPanel'&&innerWidth>=1050){$(id).classList.remove('tool-panel');$(id).hidden=false;continue;}$(id).classList.add('tool-panel');$(id).hidden=selectedPanel!==id||(id==='book'&&state?.phase===0)||(id==='votePanel'&&state?.phase!==7)||(id==='ending'&&state?.phase!==8);}for(const b of document.querySelectorAll('[data-panel]')){b.classList.toggle('active',b.dataset.panel===selectedPanel);b.disabled=b.dataset.panel==='votePanel'&&state?.phase!==7||b.dataset.panel==='ending'&&state?.phase!==8;}}
for(const id of ['book','evidencePanel','hostPanel','notesPanel','votePanel','ending','discussionPanel']){const close=document.createElement('button');close.textContent='关闭 ×';close.className='panel-close secondary';close.onclick=()=>{selectedPanel=null;applyPanels();canvas.focus();};$(id).prepend(close);}
for(const b of document.querySelectorAll('[data-panel]'))b.onclick=()=>showPanel(b.dataset.panel);
const directions={w:'up',W:'up',ArrowUp:'up',s:'down',S:'down',ArrowDown:'down',a:'left',A:'left',ArrowLeft:'left',d:'right',D:'right',ArrowRight:'right'};
canvas.addEventListener('keydown',e=>{if(directions[e.key]){e.preventDefault();keys.add(directions[e.key]);}if(e.code==='Space'){e.preventDefault();if(!e.repeat)interact();}});
window.addEventListener('keyup',e=>{if(directions[e.key])keys.delete(directions[e.key]);});canvas.addEventListener('blur',()=>keys.clear());window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{keys.clear();if(!document.hidden)window.refreshGame?.();});
canvas.addEventListener('pointerdown',()=>canvas.focus());
for(const b of document.querySelectorAll('[data-move]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.move);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(b.dataset.move));}
$('interact').onclick=interact;
function tile(col,row,x,y,w=TILE,h=TILE,img=atlas){if(img.complete&&img.naturalWidth)ctx.drawImage(img,col*17,row*17,16,16,x,y,w,h);}
// Artwork stays within the authoritative obstacle footprints; boundary props stay outside walking space.
function furnishing(index,x,y,w,h){
 if(!furnishings.complete||!furnishings.naturalWidth)return false;
 const [sx,sy,sw,sh]=[[42,24,233,290],[356,49,230,248],[664,55,236,255],[1003,64,186,215],[48,347,219,250],[327,371,289,214],[642,380,284,204],[1034,369,128,215],[28,642,257,264],[336,645,270,268],[656,654,254,254],[1007,661,175,231],[27,957,263,233],[360,934,222,272],[641,965,287,226],[961,993,269,188]][index];
 ctx.save();if(index===0){ctx.translate(x+w/2,y+h/2);ctx.rotate(-Math.PI/2);ctx.drawImage(furnishings,sx,sy,sw,sh,-h/2,-w/2,h,w);}else ctx.drawImage(furnishings,sx,sy,sw,sh,x,y,w,h);ctx.restore();return true;
}
function ground(index,x,y,w,h){if(!terrain.complete||!terrain.naturalWidth)return false;const size=terrain.naturalWidth/2;ctx.save();if(index===2){ctx.fillStyle='#243c32';ctx.fillRect(x,y,w,h);ctx.globalAlpha=.5;}ctx.drawImage(terrain,(index%2)*size,Math.floor(index/2)*size,size,size,x,y,w,h);ctx.restore();return true;}
function floor(scene){
 const key=Object.keys(SCENES).find(k=>SCENES[k]===scene);
 if(roomSurfaces.has(key)){ctx.drawImage(roomSurfaces.get(key),0,0);return;}
 const liveContext=ctx,surface=document.createElement('canvas');surface.width=WIDTH;surface.height=HEIGHT;ctx=surface.getContext('2d');ctx.imageSmoothingEnabled=false;
 const outdoor=['garden','bank'].includes(scene.kind);
 ctx.fillStyle=outdoor?'#334735':'#43372b';ctx.fillRect(0,0,WIDTH,HEIGHT);
 for(let y=0;y<15;y++)for(let x=0;x<24;x++){tile(5,outdoor?1:2,x*TILE,y*TILE);if(x===0||y===0||x===23||y===14)tile(6,2,x*TILE,y*TILE);}
 if(ground(outdoor?2:0,32,32,704,416)){ctx.save();ctx.beginPath();ctx.rect(0,0,768,32);ctx.rect(0,448,768,32);ctx.rect(0,32,32,416);ctx.rect(736,32,32,416);ctx.clip();ground(1,0,0,768,480);ctx.restore();}
 ctx.fillStyle=outdoor?'#112e3018':scene.kind==='study'?'#242e3940':'#25262d20';ctx.fillRect(0,0,WIDTH,HEIGHT);
 // Existing room geometry and rugs provide the ground plane beneath the detailed sprite furniture.
 if(outdoor){ctx.save();ctx.beginPath();ctx.rect(48,352,672,32);ctx.rect(688,128,32,224);ctx.rect(48,224,80,32);ctx.clip();ground(1,0,0,768,480);ctx.restore();}
 else{
  const rugs=scene.kind==='reading'?[[128,112,160,208],[480,112,160,208]]:scene.kind==='study'?[[288,200,192,144]]:scene.kind==='lounge'?[[240,144,288,224]]:scene.kind==='meeting'?[[256,144,256,208]]:[[208,112,352,288]];
  for(const rug of rugs)furnishing(14,...rug);
  for(const x of [80,672]){ctx.fillStyle='#1d2b36';ctx.fillRect(x-24,38,48,64);ctx.strokeStyle='#a28c67';ctx.lineWidth=2;ctx.strokeRect(x-24,38,48,64);ctx.beginPath();ctx.moveTo(x,38);ctx.lineTo(x,102);ctx.moveTo(x-24,70);ctx.lineTo(x+24,70);ctx.stroke();ctx.fillStyle='#e6b96a13';ctx.beginPath();ctx.moveTo(x-24,104);ctx.lineTo(x+24,104);ctx.lineTo(x+58,172);ctx.lineTo(x-58,172);ctx.fill();}
 }
 for(const [i,[x,y,w,h]]of scene.walls.entries()){
  if(scene.kind==='bank'&&x===96){ground(1,x,y,w,h);ground(3,x+6,y+6,w-12,h-12);}
  else{
   const index=scene.kind==='hall'?0:scene.kind==='lounge'?[1,5,6][i]:scene.kind==='reading'?[2,2,4][i]:scene.kind==='study'?[4,13,2][i]:scene.kind==='meeting'?3:scene.kind==='garden'?[15,10,9][i]:10;
   ctx.save();ctx.shadowColor='#07121899';ctx.shadowBlur=6;ctx.shadowOffsetY=4;
   if(scene.kind==='meeting'){furnishing(key==='meeting-a'?5:6,x,y,64,h);furnishing(3,x+64,y+10,64,h-20);furnishing(key==='meeting-a'?5:6,x+128,y,64,h);}
   else if([4,13].includes(index)&&w>128){const count=Math.ceil(w/80);for(let n=0;n<count;n++)furnishing(index,x+n*w/count,y,w/count,h);}
   else if(!furnishing(index,x,y,w,h)){for(let dx=0;dx<w;dx+=32)tile(42,14,x+dx,y,32,h);}
   ctx.restore();
  }
 }
 // Border furniture adds room identity without introducing invisible collision or hiding clues.
 const border=outdoor?[15,8,10,15,8]:scene.kind==='reading'?[4,4,11,4,4]:scene.kind==='study'?[4,13,12,4,11]:scene.kind==='meeting'?[8,13,12,11,8]:[8,13,12,4,8];
 for(const [i,index]of border.entries())furnishing(index,130+i*110,2,48,28);
 if(outdoor){for(let x=0;x<WIDTH;x+=50){furnishing(15,x,0,50,30);furnishing(15,x,452,50,28);}for(let y=32;y<448;y+=52){furnishing(8,0,y,30,50);furnishing(8,738,y,30,50);}}
 const shade=ctx.createRadialGradient(384,240,100,384,240,460);shade.addColorStop(0,'#07151d00');shade.addColorStop(1,outdoor?'#07151d88':'#07151d66');ctx.fillStyle=shade;ctx.fillRect(0,0,WIDTH,HEIGHT);
 roomSurfaces.set(key,surface);ctx=liveContext;ctx.drawImage(surface,0,0);
}
function draw(now){requestAnimationFrame(draw);const dt=lastFrame?Math.min((now-lastFrame)/1000,.05):0;lastFrame=now;if(!state||!local)return;
 if(!state.paused&&online){const before=local;local=stepPosition(local,Number(keys.has('right'))-Number(keys.has('left')),Number(keys.has('down'))-Number(keys.has('up')),dt);
  if(distance(before,local)>.01){if(now-lastPath>45){path.push({x:local.x,y:local.y});lastPath=now;}if(now-lastPose>50){rtc.pose(local);lastPose=now;}}
 }
 if(path.length&&now-lastSave>300&&!sending){lastSave=now;flush().catch(()=>{});}
 if(path.length>=28){keys.clear();flush().catch(()=>{});}
 const mobile=matchMedia('(max-width:700px)').matches;if(canvas.height!==(mobile?640:480))canvas.height=mobile?640:480;ctx.save();ctx.imageSmoothingEnabled=false;const zoom=mobile?2:1;const cameraX=Math.max(0,Math.min(WIDTH-WIDTH/zoom,local.x-WIDTH/zoom/2)),cameraY=Math.max(0,Math.min(HEIGHT-canvas.height/zoom,local.y-canvas.height/zoom/2));ctx.scale(zoom,zoom);ctx.translate(-cameraX,-cameraY);floor(SCENES[local.scene]);
 const doors=SCENES[local.scene].doors.filter(d=>allowedScenes(state.phase).includes(d.to));
 for(const d of doors){tile(45,2,d.x-16,d.y-16);ctx.fillStyle='#efd8a3';ctx.textAlign='center';ctx.font='14px system-ui';ctx.fillText(SCENES[d.to].name,d.x,d.y-24);}
 const targets=state.targets.map(t=>({...t,...EVIDENCE_SPOTS[t.id],kind:'clue'})).filter(t=>t.scene===local.scene);
 for(const t of targets){ctx.globalAlpha=t.done?.35:1;ctx.fillStyle=t.personal?'#dfb6ec':'#e2bd67';ctx.beginPath();ctx.arc(t.x,t.y,19+(reducedMotion?0:Math.sin(now/400)*2),0,Math.PI*2);ctx.globalAlpha*=.2;ctx.fill();ctx.globalAlpha=t.done?.35:1;tile(42,15,t.x-12,t.y-12,24,24);ctx.globalAlpha=1;}
 const people=state.world.players.map(p=>{if(p.id===state.me.id)return {...p,...local};const live=peers.get(p.id);return live&&now-live.at<1500?{...p,...live}:p;}).filter(p=>p.scene===local.scene).sort((a,b)=>a.y-b.y);
 const labels=[];for(const p of people){const person=state.players.find(q=>q.id===p.id),role=person.role??0;let rendered=peers.get('render-'+p.id)||{x:p.x,y:p.y};if(distance(rendered,p)>200)rendered={x:p.x,y:p.y};else {rendered.x+=(p.x-rendered.x)*Math.min(1,dt*14);rendered.y+=(p.y-rendered.y)*Math.min(1,dt*14);}peers.set('render-'+p.id,rendered);
  const x=p.id===state.me.id?p.x:rendered.x,y=p.id===state.me.id?p.y:rendered.y;
  const previous=lastDrawn.get(p.id)||{x,y},dx=x-previous.x,dy=y-previous.y,moving=Math.hypot(dx,dy)>.08;let direction=facing.get(p.id)||0;if(moving){direction=Math.abs(dx)>Math.abs(dy)?dx<0?1:3:dy<0?2:0;facing.set(p.id,direction);}lastDrawn.set(p.id,{x,y});
  ctx.fillStyle='#0006';ctx.beginPath();ctx.ellipse(x,y+5,13,5,0,0,Math.PI*2);ctx.fill();if(manor.complete&&manor.naturalWidth){const [sx,sy,sw,sh]=poses[direction][[3,1,2,0][role]],height=44,width=Math.round(sw/sh*height),bounce=moving&&!reducedMotion?Math.sin(now/75)*1.5:0;ctx.drawImage(manor,sx-2,sy-2,sw+4,sh+4,x-width/2,y-height+7+bounce,width,height);}else tile(role%2,role<2?6:5,x-16,y-25,32,32,characters);
  ctx.font='bold 13px system-ui';ctx.textAlign='center';const label=person.name+(person.bot?' · AI':p.id===state.me.id?' · 你':'');const width=ctx.measureText(label).width,lx=Math.max(width/2+6,Math.min(WIDTH-width/2-6,x));let ly=y-45;while(labels.some(q=>Math.abs(q.x-lx)<(q.width+width)/2+10&&Math.abs(q.y-ly)<21))ly-=22;labels.push({x:lx,y:ly,width});ctx.fillStyle='#101a1de6';ctx.fillRect(lx-width/2-5,ly-15,width+10,20);ctx.fillStyle=colors[role];ctx.fillText(label,lx,ly);
 }
 const candidates=[...doors.map(d=>({...d,kind:'door',available:true})),...targets,...(local.scene==='lounge'?[{kind:'games',x:384,y:304,available:true}]:[])].filter(t=>distance(local,t)<=REACH).sort((a,b)=>distance(local,a)-distance(local,b));interaction=candidates[0]||null;
 const hint=state.paused?'游戏暂停中':interaction?interaction.kind==='games'?'空格 · 入座玩小游戏':interaction.kind==='door'?`空格 · 进入${SCENES[interaction.to].name}`:`${interaction.done?'已调查':interaction.available?'空格 · 调查':'暂不可调查'} ${interaction.title}`:'WASD / 方向键移动 · 走近门或线索后按空格';
 if($('interactionHint').textContent!==hint)$('interactionHint').textContent=hint;$('interact').disabled=!interaction||state.paused;
 ctx.restore();canvas.dataset.scene=local.scene;canvas.dataset.x=Math.round(local.x);canvas.dataset.y=Math.round(local.y);canvas.dataset.peers=JSON.stringify(people.map(p=>({id:p.id,x:Math.round(p.x),y:Math.round(p.y)})));
}
window.scene={update,flush,applyPanels,notify:()=>rtc.invalidate(),showPanel,inspect:()=>({position:local?{...local}:null,transport:canvas.dataset.transport,peers:[...rtc.peers.values()].filter(p=>p.channel?.readyState==='open').length}),stop:()=>{keys.clear();rtc.reset();}};
window.addEventListener('resize',applyPanels);
requestAnimationFrame(draw);
