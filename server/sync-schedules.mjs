import {loadSchedule,sourcesFor} from './pipeline.mjs';
const programs=['31.05.01','31.05.02','37.05.01'];
for(const program of programs){for(let course=1;course<=6;course++){const r=await loadSchedule(program,course);console.log(JSON.stringify({program,course,status:r.status,events:r.events.length,issues:r.issues.length,message:r.message}));}}
