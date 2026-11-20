// End-to-end: real Chromium, fake microphone playing a generated scream.
// Run with `npm run test:e2e`. Needs the `playwright` package and Chromium.
// Set SCREENSHOT_DIR to save screenshots of each stage.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { startServer } from '../../scripts/serve.mjs';
import { writeFakeScream } from './fake-scream.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 8765;
const shots = process.env.SCREENSHOT_DIR;
let server;
let browser;
let workDir;

before(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'scream-bird-'));
  const wav = join(workDir, 'scream.wav');
  writeFakeScream(wav);
  server = await startServer(PORT);
  browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
});

after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r()));
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

async function waitForPhase(page, phase, timeout) {
  await page.waitForFunction((p) => window.__screamBird && window.__screamBird.phase === p, phase, { timeout, polling: 50 });
}

async function shot(page, name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
}

test('voice alone calibrates, starts, flies, dies and restarts', { timeout: 90_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 520, height: 760 } });
  await context.grantPermissions(['microphone'], { origin: `http://localhost:${PORT}` });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`http://localhost:${PORT}/`);
  await shot(page, '1-boot');
  await page.click('#enable-mic');

  await waitForPhase(page, 'calibrating', 5000);
  await page.waitForTimeout(800);
  await shot(page, '2-calibrating');

  await waitForPhase(page, 'ready', 15000);
  const cal = await page.evaluate(() => window.__screamBird.calibration);
  assert.equal(cal.fallback, false, 'calibration should hear the scream');
  assert.ok(cal.peakDb - cal.floorDb > 30, `calibrated range too small: ${JSON.stringify(cal)}`);
  await shot(page, '3-ready');

  // Nothing but the fake mic from here on.
  await waitForPhase(page, 'playing', 10000);
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < 2500) {
    samples.push(await page.evaluate(() => ({ y: window.__screamBird.bird.y, level: window.__screamBird.level })));
    await page.waitForTimeout(40);
  }
  await shot(page, '4-playing');
  const loud = samples.filter((s) => s.level > 0.8).length;
  const quiet = samples.filter((s) => s.level === 0).length;
  assert.ok(loud > 0 && quiet > 0, 'the fake mic should alternate between loud and quiet');
  const ys = samples.map((s) => s.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 40, 'the bird should move up and down with the voice');

  await waitForPhase(page, 'dead', 40000);
  await page.waitForTimeout(700);
  await shot(page, '5-game-over');

  await waitForPhase(page, 'playing', 10000);
  assert.deepEqual(errors, []);
  await context.close();
});
