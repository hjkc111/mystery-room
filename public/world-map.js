export const WIDTH=768,HEIGHT=480,TILE=32,SPEED=160,RADIUS=10,REACH=56;
const door=(id,to,x,y)=>({id,to,x,y});
export const SCENES={
 hall:{name:'庄园大厅',kind:'hall',spawn:[384,368],walls:[[256,160,256,128]],doors:[door('garden','garden',720,240),door('meeting-a','meeting-a',48,144),door('meeting-b','meeting-b',48,336)]},
 reading:{name:'安静阅览室',kind:'reading',spawn:[384,368],walls:[[160,128,96,64],[512,128,96,64],[336,96,96,64]],doors:[]},
 garden:{name:'庄园庭院',kind:'garden',spawn:[384,368],walls:[[128,128,64,64],[544,288,64,64],[352,192,64,64]],doors:[door('hall','hall',48,240),door('bank','bank',720,144),door('study','study',720,336)]},
 bank:{name:'水潭岸边',kind:'bank',spawn:[384,368],walls:[[96,96,224,224],[544,96,64,64]],doors:[door('garden','garden',720,336)]},
 study:{name:'农场书房',kind:'study',spawn:[384,368],walls:[[96,96,160,64],[448,96,224,64],[320,224,128,64]],doors:[door('garden','garden',48,336)]},
 'meeting-a':{name:'西侧会客室',kind:'meeting',spawn:[384,352],walls:[[288,176,192,96]],doors:[door('hall','hall',720,352)]},
 'meeting-b':{name:'东侧会客室',kind:'meeting',spawn:[384,352],walls:[[288,176,192,96]],doors:[door('hall','hall',720,352)]},
};
export const EVIDENCE_SPOTS={
 'turner-pocket':{scene:'garden',x:224,y:352},'james-letter':{scene:'garden',x:480,y:352},
 'alice-letter':{scene:'study',x:224,y:224},'william-note':{scene:'study',x:544,y:240},
 testimony:{scene:'bank',x:448,y:192},lastword:{scene:'garden',x:608,y:208},
 pool:{scene:'bank',x:352,y:288},quarrel:{scene:'study',x:576,y:352},
 weapon:{scene:'bank',x:448,y:304},route:{scene:'garden',x:256,y:112},
 garment:{scene:'garden',x:480,y:240},dossier:{scene:'study',x:224,y:288},
};
export function allowedScenes(phase){return phase===1?['reading']:[3,5].includes(phase)?['garden','bank','study','hall','meeting-a','meeting-b']:[4,6].includes(phase)?['hall','meeting-a','meeting-b']:['hall'];}
export function spawn(phase,index=0){const scene=allowedScenes(phase)[0],s=SCENES[scene].spawn;return {scene,x:s[0]+(index%4-1.5)*40,y:s[1],phase};}
export function privateScene(scene){return SCENES[scene]?.kind==='meeting';}
export function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
export function walkable(scene,x,y){return Number.isFinite(x)&&Number.isFinite(y)&&x>=32+RADIUS&&x<=WIDTH-32-RADIUS&&y>=32+RADIUS&&y<=HEIGHT-32-RADIUS&&!SCENES[scene]?.walls.some(([a,b,w,h])=>x>a-RADIUS&&x<a+w+RADIUS&&y>b-RADIUS&&y<b+h+RADIUS)&&Boolean(SCENES[scene]);}
export function clearPath(scene,a,b){const d=distance(a,b),steps=Math.max(1,Math.ceil(d/5));if(steps>250)return false;for(let i=1;i<=steps;i++)if(!walkable(scene,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;return true;}
export function stepPosition(p,dx,dy,dt){const scale=Math.hypot(dx,dy)||1,d=SPEED*Math.min(dt,.05);let x=p.x,y=p.y;if(clearPath(p.scene,p,{x:x+dx/scale*d,y}))x+=dx/scale*d;if(clearPath(p.scene,{x,y},{x,y:y+dy/scale*d}))y+=dy/scale*d;return {...p,x,y};}
