import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameDb, percentile, VoiceProcessor, Calibrator, MIN_DB } from '../../src/audio/voice.js';

const SAMPLE_RATE = 48000;
const BLOCK = 1024;
const DT = 1 / 60;

/** One analyser block of a sine at the given peak amplitude. */
function tone(amplitude, freq = 440) {
  const out = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return out;
}

/** Deterministic pseudo-random noise block. */
function noise(amplitude, seed = 1) {
  let s = seed;
  const out = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    s = (s * 16807) % 2147483647;
    out[i] = amplitude * ((s / 2147483647) * 2 - 1);
  }
  return out;
}

const QUIET_DB = frameDb(noise(0.002));
const LOUD_DB = frameDb(tone(0.5));

/** Run `seconds` of a constant loudness through the processor. */
function feed(vp, db, seconds) {
  const frames = [];
  for (let t = 0; t < seconds; t += DT) frames.push(vp.update(db, DT));
  return frames;
}

test('frameDb: full-scale sine is about -3 dBFS, silence is the floor', () => {
  assert.ok(Math.abs(frameDb(tone(1)) - -3.01) < 0.1);
  assert.equal(frameDb(new Float32Array(BLOCK)), MIN_DB);
  assert.ok(Math.abs(frameDb(tone(0.1)) - -23.01) < 0.1);
});

test('percentile picks values from the sorted list', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 0), 1);
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 1), 5);
  assert.equal(percentile([], 0.5), MIN_DB);
});

test('silence gives zero level and no flaps', () => {
  const vp = new VoiceProcessor();
  vp.setCalibration(QUIET_DB, LOUD_DB);
  const frames = feed(vp, QUIET_DB, 3);
  assert.ok(frames.every((f) => f.level === 0 && !f.flap));
});

test('a sustained scream reaches full level quickly and flaps exactly once', () => {
  const vp = new VoiceProcessor();
  vp.setCalibration(QUIET_DB, LOUD_DB);
  feed(vp, QUIET_DB, 0.5);
  const frames = feed(vp, LOUD_DB, 2);
  assert.ok(frames[5].level > 0.9, `level after ~80ms was ${frames[5].level}`);
  assert.equal(frames.filter((f) => f.flap).length, 1);
});

test('level rises with loudness', () => {
  const levels = [0.02, 0.05, 0.1, 0.2].map((amp) => {
    const vp = new VoiceProcessor();
    vp.setCalibration(QUIET_DB, LOUD_DB);
    const frames = feed(vp, frameDb(tone(amp)), 1);
    return frames[frames.length - 1].level;
  });
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] >= levels[i - 1], levels.join(', '));
  assert.ok(levels[0] < levels[3]);
});

test('separate shouts count as separate flaps', () => {
  const vp = new VoiceProcessor();
  vp.setCalibration(QUIET_DB, LOUD_DB);
  let flaps = 0;
  for (let i = 0; i < 5; i++) {
    flaps += feed(vp, LOUD_DB, 0.2).filter((f) => f.flap).length;
    flaps += feed(vp, QUIET_DB, 0.25).filter((f) => f.flap).length;
  }
  assert.equal(flaps, 5);
});

test('cooldown stops a stutter from double-flapping', () => {
  const vp = new VoiceProcessor({ burstCooldown: 0.5 });
  vp.setCalibration(QUIET_DB, LOUD_DB);
  let flaps = 0;
  for (let i = 0; i < 4; i++) {
    flaps += feed(vp, LOUD_DB, 0.1).filter((f) => f.flap).length;
    flaps += feed(vp, QUIET_DB, 0.15).filter((f) => f.flap).length;
  }
  assert.equal(flaps, 2);
});

test('higher sensitivity needs less volume', () => {
  const mid = frameDb(tone(0.03));
  const run = (sensitivity) => {
    const vp = new VoiceProcessor({ sensitivity });
    vp.setCalibration(QUIET_DB, LOUD_DB);
    const frames = feed(vp, mid, 1);
    return frames[frames.length - 1].level;
  };
  assert.ok(run(2) > run(1));
  assert.ok(run(1) > run(0.5));
});

test('noise floor adapts to a louder room without counting it as voice', () => {
  const vp = new VoiceProcessor();
  vp.setCalibration(QUIET_DB, LOUD_DB);
  // Background noise just under the gate (e.g. a fan switching on).
  const fanDb = vp.gateDb - 1;
  const frames = feed(vp, fanDb, 30);
  assert.ok(frames.every((f) => f.level === 0));
  assert.ok(vp.floorDb > QUIET_DB + 3, `floor stayed at ${vp.floorDb}`);
});

test('calibrator measures floor and peak from quiet then loud input', () => {
  const cal = new Calibrator();
  for (let t = 0; t < 2.1; t += DT) cal.update(QUIET_DB, DT);
  assert.equal(cal.phase, 'waitLoud');
  for (let t = 0; t < 1; t += DT) cal.update(QUIET_DB, DT);
  assert.equal(cal.phase, 'waitLoud', 'should keep waiting while quiet');
  for (let t = 0; t < 1.6; t += DT) cal.update(LOUD_DB, DT);
  assert.equal(cal.phase, 'done');
  assert.ok(Math.abs(cal.result.floorDb - QUIET_DB) < 1);
  assert.ok(Math.abs(cal.result.peakDb - LOUD_DB) < 1);
  assert.equal(cal.result.fallback, false);
});

test('calibrator falls back to a default range if nobody screams', () => {
  const cal = new Calibrator({ loudTimeout: 3 });
  for (let t = 0; t < 6; t += DT) cal.update(QUIET_DB, DT);
  assert.equal(cal.phase, 'done');
  assert.equal(cal.result.fallback, true);
  assert.ok(cal.result.peakDb > cal.result.floorDb + 15);
});
