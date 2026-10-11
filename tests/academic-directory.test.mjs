import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupsFor,streamForGroup} from '../dist/data/roster.js';
const app=await readFile(new URL('../src/app.ts',import.meta.url),'utf8');
test('all known rosters are selectable',()=>{
 const expected={'31.05.01':[35,29,22,24,22,18],'31.05.02':[7,3,0,0,0,0],'37.05.01':[2,2,0,0,0,0]};
 for(const [program,counts] of Object.entries(expected))for(let course=1;course<=6;course++)
  assert.equal(groupsFor(program,course).length,counts[course-1]);
 assert.match(app,/data-directory-group=/);
 assert.match(app,/function groupPickerHtml\(/);
 assert.match(app,/await applySelectProfile\(\)/);
 assert.doesNotMatch(app,/if\(id==='programSelect'\|\|id==='courseSelect'\)renderProfileOptions\(\)/);
});
test('sixth year no stream; years one to five both streams',()=>{
 for(let course=1;course<=5;course++){
  const values=groupsFor('31.05.01',course).map(x=>streamForGroup('31.05.01',x));
  assert.ok(values.includes('A')&&values.includes('B'));
 }
 assert.ok(groupsFor('31.05.01',6).every(x=>streamForGroup('31.05.01',x)===null));
});
