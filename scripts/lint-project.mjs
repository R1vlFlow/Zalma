import {readFile,readdir } from 'node:fs/promises';
import {join} from 'node:path';

const roots=['src','server'];
const extensions=new Set(['.ts','.mjs','.js']);
const failures=[];
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(['node_modules','dist','storage','.git'].includes(entry.name))continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory())await walk(path);
    else if(path.endsWith('server/sync-official.mjs'))continue;
    else if(path.endsWith('scripts/lint-project.mjs'))continue;
    else if(extensions.has(path.slice(path.lastIndexOf('.')))){
      const text=await readFile(path,'utf8');
      if(/console\.log\s*\(/.test(text))failures.push(`${path}: console.log is not allowed`);
      if(/\b(TODO|FIXME)\b/.test(text))failures.push(`${path}: TODO/FIXME is not allowed`);
    }
  }
}
for(const root of roots)await walk(root);
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('lint gate: clean');
