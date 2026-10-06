import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
const root=new URL('..',import.meta.url).pathname;const dist=join(root,'dist');
await mkdir(join(dist,'assets'),{recursive:true});
for(const name of ['index.html','styles.css','sw.js','manifest.webmanifest','offline.html']) await copyFile(join(root,'public',name),join(dist,name));
await cp(join(root,'public','assets'),join(dist,'assets'),{recursive:true});
await rm(join(dist,'data'),{recursive:true,force:true});
console.log('public assets copied');
