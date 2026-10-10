import { spawn } from 'node:child_process';
import { writeSync } from 'node:fs';

const port = 4179;
const child = spawn(process.execPath, ['server/server.mjs'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let startupPollTimer;
let exited = false;
let completed = false;
child.once('exit', () => { exited = true; });

function waitForExit() {
  if (exited || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => child.once('exit', resolve));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const started = new Promise((resolve, reject) => {
  const deadline = Date.now() + 5000;
  const poll = async () => {
    if (exited || child.exitCode !== null || child.signalCode !== null) {
      reject(new Error(`Server process exited before becoming healthy (code=${child.exitCode}, signal=${child.signalCode})`));
      return;
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        resolve();
        return;
      }
    } catch {}
    if (Date.now() >= deadline) {
      reject(new Error('Server start timeout'));
      return;
    }
    startupPollTimer = setTimeout(poll, 100);
  };
  poll();
});

try {
  await started;
  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
  const health = await healthResponse.json();
  if (!health.ok) throw new Error('Health endpoint returned non-ok');

  const bad = await fetch(`http://127.0.0.1:${port}/api/schedule?program=bad&course=0`, { signal: AbortSignal.timeout(2000) });
  if (bad.status !== 400) throw new Error(`Expected 400 for invalid schedule query, got ${bad.status}`);

  const index = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
  if (!index.ok) throw new Error(`Static index failed: ${index.status}`);

  writeSync(1, JSON.stringify({ ok: true, health: 200, invalidSchedule: bad.status, index: index.status }, null, 2) + '\n');
  completed = true;
} finally {
  if (startupPollTimer) clearTimeout(startupPollTimer);

  // Register the exit listener before sending SIGTERM so a fast process exit
  // cannot be missed. Never let a failed child teardown hang the entire QA run.
  const gracefulExit = waitForExit();
  if (!exited && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const stopped = await Promise.race([gracefulExit.then(() => true), delay(1500).then(() => false)]);

  if (!stopped && !exited && child.exitCode === null && child.signalCode === null) {
    const forcedExit = waitForExit();
    child.kill('SIGKILL');
    await Promise.race([forcedExit, delay(1000)]);
  }
}

// The smoke process must not keep the QA runner alive because of idle fetch sockets.
// This is only reached after all assertions pass and the child server teardown ran.
if (completed) process.exit(0);
