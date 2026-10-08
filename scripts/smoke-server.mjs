import { spawn } from 'node:child_process';

const port = 4179;
const child = spawn(process.execPath, ['server/server.mjs'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: ['ignore','pipe','pipe'] });
const started = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Server start timeout')), 5000);
  child.stderr.on('data', chunk => { if (String(chunk).toLowerCase().includes('error')) { /* keep waiting; fetch below is authoritative */ } });
  const poll = async () => {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) { clearTimeout(timer); resolve(); return; } } catch {}
    setTimeout(poll, 100);
  };
  poll();
});
try {
  await started;
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  if (!health.ok) throw new Error('Health endpoint returned non-ok');
  const bad = await fetch(`http://127.0.0.1:${port}/api/schedule?program=bad&course=0`);
  if (bad.status !== 400) throw new Error(`Expected 400 for invalid schedule query, got ${bad.status}`);
  const index = await fetch(`http://127.0.0.1:${port}/`);
  if (!index.ok) throw new Error(`Static index failed: ${index.status}`);
  console.log(JSON.stringify({ok:true, health:200, invalidSchedule:bad.status, index:index.status}, null, 2));
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
}
