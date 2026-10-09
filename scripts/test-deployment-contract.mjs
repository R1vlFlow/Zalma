import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>readFile(join(root,p),'utf8');
const [pages,sync,guide,readme]=await Promise.all([
  read('.github/workflows/pages.yml'),
  read('.github/workflows/sync-official-schedules.yml'),
  read('README_FIRST.md'),
  read('README.md')
]);
const checks=[];
const check=(name,condition)=>checks.push([name,Boolean(condition)]);
check('normal deploy handles main and master',/branches:\s*\[\s*main,\s*master\s*\]/.test(pages));
check('normal deploy supports manual runs',/^\s*workflow_dispatch:\s*$/m.test(pages));
check('source and schedule workflows serialize without cancellation',pages.includes('group: pages')&&sync.includes('group: pages')&&pages.includes('cancel-in-progress: false')&&sync.includes('cancel-in-progress: false'));
check('scheduled sync does not compete on every code push',!/^\s*push:\s*$/m.test(sync));
check('both workflows publish dist artifacts',pages.includes('path: dist')&&sync.includes('path: dist'));
check('both workflows use official Pages deployment',pages.includes('actions/deploy-pages@v4')&&sync.includes('actions/deploy-pages@v4'));
check('docs say Pages URL has no /dist/ suffix',guide.includes('без `/dist/`')&&readme.includes('without `/dist/`'));
check('official data refresh remains scheduled and manually available',/^\s*workflow_dispatch:\s*$/m.test(sync)&&/^\s*schedule:\s*$/m.test(sync));
const failures=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} — ${name}`);
console.log(`DEPLOYMENT CONTRACT: ${checks.length-failures.length}/${checks.length} passed`);
if(failures.length)process.exit(1);
