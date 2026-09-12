import {SCENES,walkable,clearPath,distance,allowedScenes} from './world-map.js';
// Four-neighbour grid search; every endpoint connection is collision checked.
export function route(scene,start,end){
 if(clearPath(scene,start,end))return [start,end];
 const nodes=[];for(let y=48;y<=432;y+=16)for(let x=48;x<=720;x+=16)if(walkable(scene,x,y))nodes.push({x,y});
 const index=new Map(nodes.map((p,i)=>[`${p.x},${p.y}`,i]));
 const nearest=p=>nodes.map((q,i)=>({i,d:distance(p,q)})).sort((a,b)=>a.d-b.d).find(q=>clearPath(scene,p,nodes[q.i]))?.i;
 const a=nearest(start),b=nearest(end);if(a===undefined||b===undefined)return null;
 const prev=new Map([[a,null]]),queue=[a];for(let n=0;n<queue.length&&!prev.has(b);n++){const i=queue[n],p=nodes[i];for(const [dx,dy]of [[16,0],[-16,0],[0,16],[0,-16]]){const j=index.get(`${p.x+dx},${p.y+dy}`);if(j!==undefined&&!prev.has(j)&&clearPath(scene,p,nodes[j])){prev.set(j,i);queue.push(j);}}}
 if(!prev.has(b))return null;const raw=[end];for(let i=b;i!==null;i=prev.get(i))raw.push(nodes[i]);raw.push(start);raw.reverse();
 const result=[start];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!clearPath(scene,raw[i],raw[j]))j--;result.push(raw[j]);i=j;}return result;
}
export function nextDoor(from,to,phase){
 const queue=[from],prev=new Map([[from,null]]);for(let i=0;i<queue.length;i++)for(const d of SCENES[queue[i]].doors)if(allowedScenes(phase).includes(d.to)&&!prev.has(d.to)){prev.set(d.to,{from:queue[i],door:d});queue.push(d.to);}
 if(!prev.has(to)||from===to)return null;let item=prev.get(to);while(item.from!==from)item=prev.get(item.from);return item.door;
}
export function pathPosition(points,elapsed,speed=120){let left=Math.max(0,elapsed)*speed/1000;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=distance(a,b);if(left<d)return {x:a.x+(b.x-a.x)*left/d,y:a.y+(b.y-a.y)*left/d,arrived:false};left-=d;}const end=points.at(-1);return {x:end.x,y:end.y,arrived:true};}
