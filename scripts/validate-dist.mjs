import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
const root=new URL('..',import.meta.url).pathname;const dist=join(root,'dist');
for(const f of ['index.html','styles.css','main.js','sw.js','manifest.webmanifest','offline.html'])await readFile(join(dist,f));
const html=await readFile(join(dist,'index.html'),'utf8');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML ids');
const internal=[...html.matchAll(/(?:href|src)="\.\/([^"#]+)"/g)].map(m=>m[1]);for(const p of internal)await stat(join(dist,p));
console.log(JSON.stringify({ok:true,ids:ids.length,internalAssets:internal.length},null,2));
