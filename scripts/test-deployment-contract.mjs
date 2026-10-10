import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>readFile(join(root,p),'utf8');
const [pages,sync,guide,readme,specialistProducer,copyPublic,pipeline]=await Promise.all([
  read('.github/workflows/pages.yml'),
  read('.github/workflows/sync-official-schedules.yml'),
  read('README_FIRST.md'),
  read('README.md'),
  read('scripts/build_specialist_program_schedules.py'),
  read('scripts/copy-public.mjs'),
  read('server/pipeline.mjs')
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
check('both deploy paths fetch multi-faculty snapshots without stale fallback',pages.includes('run: python scripts/build_specialist_program_schedules.py')&&sync.includes('run: python scripts/build_specialist_program_schedules.py')&&!pages.includes('--use-last-good')&&!sync.includes('--use-last-good'));
check('official Pages build requires live specialist snapshot and strict release audit',pages.includes("REQUIRE_SPECIALIST_SNAPSHOT: '1'")&&sync.includes("REQUIRE_SPECIALIST_SNAPSHOT: '1'")&&pages.includes('scripts/validate_production_release.py')&&sync.includes('scripts/validate_production_release.py'));
check('specialist producer discovers official page, verifies document identity and keeps last-good',specialistProducer.includes('page_candidates')&&specialistProducer.includes('SOURCE_FACULTY_MISMATCH')&&specialistProducer.includes('keep_last_good'));
check('specialist JSON is bundled into per-program static snapshots',copyPublic.includes("'data','program-schedules.json'")&&copyPublic.includes("'data','schedules',program")&&copyPublic.includes('REQUIRE_SPECIALIST_SNAPSHOT'));
check('server checks generated specialist snapshot before memory/redis/disk cache',pipeline.indexOf('loadGeneratedSpecialistSnapshot(program,course)')<pipeline.indexOf('const mem=memory.get(key)'));

const failures=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} — ${name}`);
console.log(`DEPLOYMENT CONTRACT: ${checks.length-failures.length}/${checks.length} passed`);
if(failures.length)process.exit(1);
