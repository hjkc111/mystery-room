import {Miniflare} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
export async function runtime({persist=false,port=0,bindings={}}={}){
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-07-30',d1Databases:['DB'],d1Persist:persist,port,host:'127.0.0.1',bindings});
 const db=await mf.getD1Database('DB');await db.prepare('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)').run();
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){if(await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first())continue;const sql=readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);await db.batch([...sql.map(s=>db.prepare(s)),db.prepare('INSERT INTO local_migrations(name) VALUES(?)').bind(name)]);}
 return {mf,db};
}
