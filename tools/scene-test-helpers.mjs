import {SCENES,clearPath,walkable} from '../public/world-map.js';
export async function position(page){return page.evaluate(()=>window.scene.inspect().position);}
export async function walk(page,target){
 let p=await position(page);const scene=p.scene,nodes=[];
 for(let y=48;y<=432;y+=32)for(let x=48;x<=720;x+=32)if(walkable(scene,x,y))nodes.push({x,y});
 const nearest=(point)=>nodes.filter(n=>clearPath(scene,point,n)).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];
 const start=nearest(p),end=nearest(target);if(!start||!end)throw new Error('Unreachable target');
 const key=n=>n.x+','+n.y,map=new Map(nodes.map(n=>[key(n),n])),queue=[start],prev=new Map([[key(start),null]]);
 for(let i=0;i<queue.length&&!prev.has(key(end));i++){const n=queue[i];for(const [dx,dy] of [[32,0],[-32,0],[0,32],[0,-32]]){const next=map.get((n.x+dx)+','+(n.y+dy));if(next&&!prev.has(key(next))&&clearPath(scene,n,next)){prev.set(key(next),n);queue.push(next);}}}
 if(!prev.has(key(end)))throw new Error('No route in '+scene);
 const route=[];for(let n=end;n;n=prev.get(key(n)))route.unshift(n);route.push(target);
 const compact=[route[0]];for(let i=1;i<route.length-1;i++){const a=route[i-1],b=route[i],c=route[i+1];if((b.x-a.x)*(c.y-b.y)!==(b.y-a.y)*(c.x-b.x))compact.push(b);}compact.push(target);
 await page.locator('#world').focus();
 for(const goal of compact){for(let attempt=0;attempt<4;attempt++){
  p=await position(page);const dx=goal.x-p.x,dy=goal.y-p.y,dist=Math.hypot(dx,dy);if(dist<5)break;
  const keys=[];if(Math.abs(dx)>3)keys.push(dx>0?'ArrowRight':'ArrowLeft');if(Math.abs(dy)>3)keys.push(dy>0?'ArrowDown':'ArrowUp');
  const duration=Math.min(...[Math.abs(dx)>3?Math.abs(dx):Infinity,Math.abs(dy)>3?Math.abs(dy):Infinity])* (keys.length===2?Math.SQRT2:1)/160*1000;
  for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(Math.max(20,duration));for(const k of keys)await page.keyboard.up(k);
 }}
 await page.evaluate(()=>window.scene.flush());p=await position(page);if(Math.hypot(p.x-target.x,p.y-target.y)>18)throw new Error('Walk failed '+JSON.stringify({p,target}));
}
export async function go(page,destination){
 for(let tries=0;tries<8;tries++){const p=await position(page);if(p.scene===destination)return;
 const queue=[[p.scene]],seen=new Set();let route;while(queue.length){const r=queue.shift(),last=r.at(-1);if(last===destination){route=r;break;}if(seen.has(last))continue;seen.add(last);for(const d of SCENES[last].doors)queue.push([...r,d.to]);}
 if(!route)throw new Error('No door route');const door=SCENES[p.scene].doors.find(d=>d.to===route[1]);await walk(page,door);await page.keyboard.press('Space');await page.waitForFunction(scene=>document.querySelector('#world').dataset.scene===scene,door.to,{timeout:8000});
 }throw new Error('Too many doors');
}
export async function closePanels(page){for(const b of await page.locator('.tool-panel:not([hidden]) .panel-close').all())await b.click();}
