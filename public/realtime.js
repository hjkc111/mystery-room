import {walkable} from './world-map.js';

export class Realtime {
 constructor({api,onPose,onInvalidate,onStatus}){Object.assign(this,{api,onPose,onInvalidate,onStatus});this.peers=new Map();this.room=null;this.me=null;this.closed=false;this.serial=0;this.disabled=new URLSearchParams(location.search).has('noRTC');}
 reset(){for(const p of this.peers.values())p.pc.close();this.peers.clear();this.room=null;}
 async signal(peer){
  const pc=peer.pc;
  if(pc.iceGatheringState!=='complete')await new Promise(resolve=>{const done=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',done);resolve();}};const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',done);resolve();},2500);pc.addEventListener('icegatheringstatechange',done);});
  if(this.peers.get(peer.id)!==peer||pc.signalingState==='closed')return;
  await this.api('/api/signal',{room:this.room,to:peer.id,epoch:peer.epoch,description:pc.localDescription.toJSON()});
 }
 create(id,epoch){
  this.peers.get(id)?.pc.close();
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]}),peer={id,pc,epoch,created:performance.now(),lastSeq:-1,rtt:null,lastPing:0};this.peers.set(id,peer);
  pc.ondatachannel=e=>this.attach(peer,e.channel);
  pc.onconnectionstatechange=()=>this.status();
  return peer;
 }
 attach(peer,channel){
  peer.channel=channel;
  channel.onopen=()=>this.status();channel.onclose=()=>this.status();
  channel.onmessage=e=>{
   if(typeof e.data!=='string'||e.data.length>1000)return;
   try{const m=JSON.parse(e.data);
    if(m.type==='pose'&&m.phase===this.phase&&Number.isSafeInteger(m.seq)&&m.seq>peer.lastSeq&&walkable(m.scene,m.x,m.y)){
     peer.lastSeq=m.seq;this.onPose(peer.id,m);
    }else if(m.type==='refresh'){const now=performance.now();if(!peer.lastRefresh||now-peer.lastRefresh>250){peer.lastRefresh=now;this.onInvalidate();}}
    else if(m.type==='ping'&&Number.isFinite(m.at)&&channel.readyState==='open')channel.send(JSON.stringify({type:'pong',at:m.at}));
    else if(m.type==='pong'&&m.at===peer.lastPing){peer.rtt=Math.round(performance.now()-m.at);this.status();}
   }catch{}
  };
 }
 async sync(v){
  if(this.room!==v.code||this.me!==v.me.id){this.reset();this.room=v.code;this.me=v.me.id;}
  this.phase=v.phase;
  if(this.disabled||!globalThis.RTCPeerConnection){this.status();return;}
  const humans=v.players.filter(p=>!p.bot&&p.id!==this.me&&p.online);
  for(const [id,p] of this.peers)if(!humans.some(q=>q.id===id)){p.pc.close();this.peers.delete(id);}
  for(const human of humans){
   let p=this.peers.get(human.id);
   if(this.me<human.id&&(!p||(p.channel?.readyState!=='open'&&performance.now()-p.created>15000))){
    p=this.create(human.id,crypto.randomUUID());this.attach(p,p.pc.createDataChannel('positions',{ordered:false,maxRetransmits:0}));
    try{await p.pc.setLocalDescription(await p.pc.createOffer());await this.signal(p);}catch{p.created=performance.now()-10000;}
   }
  }
  for(const s of v.signals||[]){
   if(!humans.some(p=>p.id===s.sender))continue;
   let p=this.peers.get(s.sender);
   try{
    if(s.description.type==='offer'&&s.sender<this.me&&p?.epoch!==s.epoch){p=this.create(s.sender,s.epoch);await p.pc.setRemoteDescription(s.description);await p.pc.setLocalDescription(await p.pc.createAnswer());await this.signal(p);}
    else if(s.description.type==='answer'&&p?.epoch===s.epoch&&p.pc.signalingState==='have-local-offer')await p.pc.setRemoteDescription(s.description);
   }catch{}
  }
  this.status();
 }
 broadcast(data){const raw=JSON.stringify(data);for(const p of this.peers.values())if(p.channel?.readyState==='open'&&p.channel.bufferedAmount<16000){try{p.channel.send(raw);}catch{}}}
 pose(p){this.broadcast({type:'pose',phase:this.phase,scene:p.scene,x:p.x,y:p.y,seq:++this.serial});}
 invalidate(){this.broadcast({type:'refresh'});}
 status(){const open=[...this.peers.values()].filter(p=>p.channel?.readyState==='open');for(const p of open)if(performance.now()-p.lastPing>2000){p.lastPing=performance.now();try{p.channel.send(JSON.stringify({type:'ping',at:p.lastPing}));}catch{}}
  const rtts=open.map(p=>p.rtt).filter(x=>x!==null);this.onStatus({channels:open.length,rtt:rtts.length?Math.max(...rtts):null,mode:open.length?'WebRTC':'HTTP'});
 }
}
