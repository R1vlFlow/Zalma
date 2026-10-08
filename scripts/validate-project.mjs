import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const required = [
  'package.json','tsconfig.json','src/main.ts','src/app.ts','public/index.html','public/styles.css',
  'public/boot.js','public/sw.js','data/official-schedules.json','server/server.mjs','server/pipeline.mjs',
  '.github/workflows/pages.yml','.github/workflows/qa.yml'
];
for (const rel of required) await access(join(root, rel));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
  if (name === 'qa') continue;
  if (!command) throw new Error(`Empty npm script: ${name}`);
}
console.log(JSON.stringify({ok:true, requiredFiles:required.length, npmScripts:Object.keys(pkg.scripts??{}).length}, null, 2));
