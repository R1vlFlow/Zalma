import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFile(join(root, path), 'utf8');
const json = async path => JSON.parse(await read(path));
const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push([name, true]); }
  catch (error) { checks.push([name, false]); console.error(`FAIL — ${name}: ${error.message}`); }
}
const [pkg, manifest, runtime, html, boot, telemetry, capacitor, androidWorkflow, pagesWorkflow, qaWorkflow, syncWorkflow, engineVersionFile, parserDoc, installDoc, rcDoc, faq] = await Promise.all([
  json('package.json'), json('public/manifest.webmanifest'), read('public/runtime-config.js'), read('public/index.html'),
  read('public/boot.js'), read('public/telemetry.js'), json('capacitor.config.json'), read('.github/workflows/android-apk.yml'),
  read('.github/workflows/pages.yml'), read('.github/workflows/qa.yml'), read('.github/workflows/sync-official-schedules.yml'), read('SCHEDULE_ENGINE_VERSION.txt'), read('docs/PRODUCTION_READINESS_RC.md'),
  read('docs/ANDROID_INSTALL.md'), read('docs/PRODUCTION_READINESS_RC.md'), read('src/ui/faq.ts')
]);

await check('RC version is marked pre-release', () => assert.match(pkg.version, /-rc\./));
await check('Schedule engine version is aligned with sync workflow', () => {
  assert.match(engineVersionFile, /^Almazov Student schedule engine: 4\.9\.0-rc\.1/m);
  assert.match(syncWorkflow, /SCHEDULE_ENGINE_VERSION: '4\.9\.0-rc\.1'/);
  assert.match(syncWorkflow, /verify_engine_version\.py/);
});
await check('PWA manifest uses standalone and project-relative scope', () => {
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.scope, './'); assert.match(manifest.start_url, /^\.\//);
});
await check('PWA manifest declares all three valid icons', () => {
  for (const [path, size] of [['public/assets/pwa-192.png',192],['public/assets/pwa-512.png',512],['public/assets/pwa-maskable-512.png',512]]) {
    const icon = manifest.icons.find(item => item.src === path.replace('public/','') && item.sizes === `${size}x${size}`);
    assert.ok(icon, `${path} missing from manifest`);
  }
});
await check('PWA install UI and platform instructions are present', () => {
  assert.match(html, /data-install-pwa/); assert.match(html, /id="installHelpDialog"/);
  assert.match(html, /На экран/); assert.match(html, /Safari/); assert.match(boot, /beforeinstallprompt/);
});
await check('APK link uses the configured project release', () => {
  const releaseTag = `v${pkg.version}`;
  const escapedTag = releaseTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(html, new RegExp(`github\\.com/r1vlflow/Zalma/releases/download/${escapedTag}/Zalma\\.apk`));
  assert.match(installDoc, new RegExp(`Releases.*${escapedTag}`));
  assert.match(androidWorkflow, new RegExp(`default: '${escapedTag}'`));
});
await check('Capacitor packages and config match the web build', () => {
  assert.equal(pkg.dependencies['@capacitor/core'], '8.5.3');
  assert.equal(pkg.dependencies['@capacitor/android'], '8.5.3');
  assert.equal(pkg.devDependencies['@capacitor/cli'], '8.5.3');
  assert.equal(capacitor.webDir, 'dist'); assert.equal(capacitor.server.cleartext, false);
});
await check('Android workflow builds an APK and uploads it automatically after app changes', () => {
  assert.match(androidWorkflow, /on:\s*\n\s*push:/);
  assert.match(androidWorkflow, /'public\/\*\*'/);
  assert.match(androidWorkflow, /sdkmanager/); assert.match(androidWorkflow, /assembleDebug/);
  assert.match(androidWorkflow, /release\/Zalma\.apk/); assert.match(androidWorkflow, /upload-artifact@v4/);
  assert.match(androidWorkflow, /gh release upload/); assert.match(androidWorkflow, /cancel-in-progress: false/);
});
await check('Release workflows require minification', () => {
  assert.match(pagesWorkflow, /REQUIRE_MINIFICATION:\s*["']?1/);
  assert.match(qaWorkflow, /REQUIRE_MINIFICATION:\s*["']?1/);
  assert.match(syncWorkflow, /REQUIRE_MINIFICATION:\s*["']?1/);
  assert.match(pkg.scripts['build:rc'], /REQUIRE_MINIFICATION=1/);
});
await check('Client error capture is privacy-preserving and remote IDs are not fabricated', () => {
  assert.match(telemetry, /unhandledrejection/); assert.match(telemetry, /sendRemote/);
  assert.match(telemetry, /navigation_/); assert.match(telemetry, /never send names, task text, file names or form values/);
  assert.match(runtime, /googleAnalyticsId:\s*''/); assert.match(runtime, /yandexMetrikaId:\s*''/);
  assert.match(rcDoc, /disabled by default/i);
});
await check('SEO and social-share metadata are present', () => {
  assert.match(html, /name="description"/); assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/); assert.match(html, /name="viewport"/);
  assert.match(html, /rel="apple-touch-icon"/);
});
await check('Install FAQ and HTTPS Telegram support are documented', () => {
  assert.match(html, /https:\/\/t\.me\/R1vlFlow_GY/);
  assert.match(faq, /Как установить приложение на Android/);
  assert.match(faq, /Как добавить приложение на экран iPhone/);
});
await check('Production documentation discloses APK signing and API requirements', () => {
  assert.match(rcDoc, /debug-signed APK/); assert.match(rcDoc, /Node backend/);
  assert.match(parserDoc, /synthetic Stream A matrix regression fixture/i);
});
await check('Page and QA workflows install Python parser dependencies', () => {
  for (const [name, body] of [['pages',pagesWorkflow],['qa',qaWorkflow],['android',androidWorkflow],['sync',syncWorkflow]]) {
    assert.match(body, /setup-python@v5/, `${name}: setup-python missing`);
    assert.match(body, /requirements-official-sync\.txt/, `${name}: parser requirements missing`);
  }
});
await check('Official ingestion workflows install Russian OCR for scanned/image sources', async () => {
  const source = await read('scripts/build_official_schedule.py');
  assert.match(source, /if fmt == 'image':[\s\S]*?pytesseract\.image_to_string/);
  for (const [name, body] of [['pages', pagesWorkflow], ['sync', syncWorkflow]]) {
    assert.match(body, /tesseract-ocr-rus/, `${name}: Russian OCR language pack missing`);
    assert.match(body, /tesseract-ocr(?:\s|$)/, `${name}: Tesseract engine missing`);
  }
});
await check('Workflow caches do not require lockfiles/wrappers absent before dependency scaffolding', () => {
  assert.doesNotMatch(androidWorkflow, /cache:\s*npm/);
  assert.doesNotMatch(androidWorkflow, /cache:\s*gradle/);
});
await check('PWA assets exist and match manifest dimensions', async () => {
  for (const [path,size] of [['public/assets/pwa-192.png',192],['public/assets/pwa-512.png',512],['public/assets/pwa-maskable-512.png',512]]) {
    const image = await readFile(join(root,path));
    assert.equal(image.readUInt32BE(16),size); assert.equal(image.readUInt32BE(20),size);
    await stat(join(root,path));
  }
});
await check('Frontend does not hardcode localhost API URLs', async () => {
  async function walk(dir) {
    const result=[];
    for (const entry of await readdir(join(root,dir),{withFileTypes:true})) {
      const path=join(dir,entry.name);
      if (entry.isDirectory()) result.push(...await walk(path));
      else if (/\.(?:ts|js|html|css)$/i.test(entry.name)) result.push(path);
    }
    return result;
  }
  for (const path of [...await walk('src'),...await walk('public')]) {
    const contents=await read(path);
    assert.doesNotMatch(contents,/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i,`${path} contains a development API origin`);
  }
});
const failures = checks.filter(([,ok])=>!ok);
for (const [name,ok] of checks) if(ok) console.log(`PASS — ${name}`);
console.log(`RC CONTRACT: ${checks.length-failures.length}/${checks.length} passed`);
if (failures.length) process.exit(1);
