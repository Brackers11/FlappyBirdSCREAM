import { openMic, micErrorMessage } from './audio/mic.js';
import { VoiceProcessor, Calibrator } from './audio/voice.js';
import { createSfx } from './audio/sfx.js';
import { WORLD, MODES, createBird, stepBird } from './game/physics.js';
import { Obstacles } from './game/obstacles.js';
import {
  COLORS,
  drawBackground,
  drawColumns,
  drawGround,
  drawBird,
  drawParticles,
  drawMeter,
  beakTip,
} from './game/render.js';
import {
  drawCalibration,
  drawReady,
  drawScore,
  drawGameOver,
  drawWin,
  drawCountdown,
  drawPaused,
  drawDebug,
  drawNoSignal,
} from './ui/screens.js';
import { loadSettings, saveSettings, loadBest, saveBest } from './ui/storage.js';

const STEP = 1 / 120; // fixed physics step
const READY_DELAY = 0.4; // ignore noise right after the ready screen appears
const RESTART_LOCKOUT = 1.0; // a dying scream shouldn't instantly restart
const CALIBRATION_HOLD = 1.0; // show "Got it!" this long
// A working mic always picks up some hiss. Perfect digital silence for this
// long means audio isn't reaching the game (usually a sleeping AudioContext).
const DEAD_AIR_DB = -95;
const DEAD_AIR_SECONDS = 1.5;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const bootEl = document.getElementById('boot');
const bootError = document.getElementById('boot-error');
const enableBtn = document.getElementById('enable-mic');
const settingsBtn = document.getElementById('settings-btn');
const settingsEl = document.getElementById('settings');
const settingsForm = document.getElementById('settings-form');
const sensitivityOut = document.getElementById('sensitivity-value');
const recalibrateBtn = document.getElementById('recalibrate');
const closeSettingsBtn = document.getElementById('close-settings');

const params = new URLSearchParams(location.search);
const debug = params.has('debug');

const settings = loadSettings();
// ?mode=plank (or scream/classic) picks the mode from the link itself.
if (MODES[params.get('mode')]) settings.mode = params.get('mode');
const voice = new VoiceProcessor({ sensitivity: settings.sensitivity });
let mic = null;
let sfx = createSfx(() => null);

const game = {
  phase: 'boot', // boot | calibrating | ready | playing | dead | won
  phaseTime: 0,
  time: 0,
  calibrator: null,
  bird: createBird(),
  obstacles: new Obstacles(MODES[settings.mode]),
  score: 0,
  best: loadBest(settings.mode),
  newBest: false,
  scroll: 0,
  particles: [],
  shake: 0,
  ringTimer: 0,
  accumulator: 0,
  pendingFlap: false,
  paused: false,
  countdown: 0,
  input: { level: 0, flap: false, active: false, db: -100 },
  fps: 60,
  deadAir: 0,
};

const noSignal = () => Boolean(mic) && game.deadAir > DEAD_AIR_SECONDS;

const mode = () => MODES[settings.mode];

function setPhase(phase) {
  game.phase = phase;
  game.phaseTime = 0;
}

function newRun() {
  game.bird = createBird();
  game.obstacles = new Obstacles(mode());
  game.score = 0;
  game.newBest = false;
  game.accumulator = 0;
  game.pendingFlap = false;
  game.particles = game.particles.filter((p) => p.kind === 'ring');
}

function startCalibration() {
  game.calibrator = new Calibrator();
  setPhase('calibrating');
}

function goReady() {
  newRun();
  setPhase('ready');
}

function die() {
  const bird = game.bird;
  bird.alive = false;
  game.shake = 14;
  sfx.hit();
  const colors = [COLORS.body, COLORS.wing, COLORS.belly];
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 200;
    game.particles.push({
      kind: 'feather',
      x: bird.x,
      y: bird.y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 80,
      rot: a,
      vr: (Math.random() - 0.5) * 10,
      age: 0,
      life: 0.9 + Math.random() * 0.6,
      color: colors[i % colors.length],
    });
  }
  if (game.score > game.best) {
    game.best = game.score;
    game.newBest = true;
    saveBest(settings.mode, game.best);
  }
  setPhase('dead');
}

function win() {
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(settings.mode, game.best);
  }
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 260;
    game.particles.push({
      kind: 'feather',
      x: WORLD.width / 2,
      y: WORLD.playHeight * 0.4,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 150,
      rot: a,
      vr: (Math.random() - 0.5) * 10,
      age: 0,
      life: 1.5 + Math.random(),
      color: [COLORS.beak, COLORS.columnEdge, COLORS.belly][i % 3],
    });
  }
  sfx.score();
  setPhase('won');
}

function spawnRings(dt) {
  const level = game.input.level;
  if (level < 0.3 || !game.bird.alive) return;
  game.ringTimer -= dt;
  if (game.ringTimer <= 0) {
    const tip = beakTip(game.bird);
    game.particles.push({ kind: 'ring', x: tip.x, y: tip.y, age: 0, life: 0.45, size: 0.5 + level });
    game.ringTimer = 0.13 - level * 0.07;
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.age += dt;
    if (p.kind === 'ring') {
      p.x -= game.obstacles.speed * dt * 0.5;
    } else if (p.kind === 'feather') {
      p.vy += 500 * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }
  game.particles = game.particles.filter((p) => p.age < p.life);
}

function stepPlaying(dt) {
  game.accumulator += dt;
  while (game.accumulator >= STEP) {
    game.accumulator -= STEP;
    const flap = game.pendingFlap;
    game.pendingFlap = false;
    if (flap && !mode().thrust) game.bird.wing += Math.PI;
    const hitGround = stepBird(game.bird, { level: game.input.level, flap }, mode(), STEP);
    game.scroll += game.obstacles.update(STEP, game.score);
    const passed = game.obstacles.collectPassed(game.bird.x);
    if (passed) {
      game.score += passed;
      sfx.score();
      if (mode().winScore && game.score >= mode().winScore) {
        win();
        return;
      }
    }
    if (hitGround || game.obstacles.hits(game.bird)) {
      die();
      return;
    }
  }
}

function update(dt) {
  game.time += dt;
  game.phaseTime += dt;
  const input = game.input;

  if (input.flap) game.pendingFlap = true;
  game.shake = Math.max(0, game.shake - dt * 30);
  updateParticles(dt);

  if (game.paused) return;

  switch (game.phase) {
    case 'calibrating': {
      const cal = game.calibrator;
      if (cal.phase !== 'done' && noSignal()) {
        // Measuring silence from a dead input would ruin calibration;
        // start over once sound arrives.
        game.calibrator = new Calibrator();
      } else if (cal.phase !== 'done') {
        cal.update(input.db, dt);
        if (cal.phase === 'done') voice.setCalibration(cal.result.floorDb, cal.result.peakDb);
      } else if (cal.time >= CALIBRATION_HOLD) {
        goReady();
      } else {
        cal.time += dt;
      }
      break;
    }

    case 'ready': {
      const bird = game.bird;
      bird.y = WORLD.playHeight * 0.45 + Math.sin(game.time * 3) * 10;
      bird.wing += dt * (10 + input.level * 30);
      bird.angle = 0;
      game.scroll += 60 * dt;
      spawnRings(dt);
      if (game.phaseTime > READY_DELAY && input.flap) {
        sfx.start();
        game.pendingFlap = true;
        setPhase('playing');
      } else {
        game.pendingFlap = false;
      }
      break;
    }

    case 'playing':
      if (game.countdown > 0) {
        game.countdown -= dt;
        game.pendingFlap = false;
        break;
      }
      stepPlaying(dt);
      spawnRings(dt);
      if (game.phase === 'playing' && input.level > 0.85) game.shake = Math.max(game.shake, (input.level - 0.85) * 25);
      break;

    case 'won': {
      // Celebration screams must not restart the run: only a tap does.
      const bird = game.bird;
      bird.y += (WORLD.playHeight * 0.45 + Math.sin(game.time * 3) * 10 - bird.y) * Math.min(1, dt * 3);
      bird.vy = 0;
      bird.angle = 0;
      bird.wing += dt * 20;
      game.scroll += game.obstacles.speed * dt;
      game.pendingFlap = false;
      break;
    }

    case 'dead':
      stepBird(game.bird, { level: 0, flap: false }, mode(), dt);
      if (game.phaseTime > RESTART_LOCKOUT && input.flap) {
        newRun();
        sfx.start();
        game.pendingFlap = true;
        setPhase('playing');
      } else {
        game.pendingFlap = false;
      }
      break;

    default:
      break;
  }
}

function render() {
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground(ctx, game.time, game.scroll);
  drawColumns(ctx, game.obstacles.columns);
  drawGround(ctx, game.scroll);
  drawParticles(ctx, game.particles);
  if (game.phase !== 'boot' && game.phase !== 'calibrating') drawBird(ctx, game.bird, game.input.level);
  ctx.restore();

  switch (game.phase) {
    case 'calibrating':
      drawCalibration(ctx, game.calibrator, game.time);
      break;
    case 'ready':
      drawReady(ctx, settings.mode, game.best, game.time);
      break;
    case 'playing':
      drawScore(ctx, game.score, mode().winScore);
      if (game.countdown > 0 && !game.paused) drawCountdown(ctx, game.countdown);
      break;
    case 'won':
      drawWin(ctx, { score: game.score, t: game.time });
      break;
    case 'dead':
      drawScore(ctx, game.score, mode().winScore);
      if (game.phaseTime > 0.5) {
        drawGameOver(ctx, {
          score: game.score,
          best: game.best,
          newBest: game.newBest,
          canRestart: game.phaseTime > RESTART_LOCKOUT,
          stillLoud: voice.bursting,
          t: game.time,
        });
      }
      break;
    default:
      break;
  }
  if (game.paused && game.phase !== 'boot') drawPaused(ctx);
  if (noSignal() && !game.paused) drawNoSignal(ctx, game.deadAir, mic.diagnostics);
  if (mic && settings.showMeter) drawMeter(ctx, voice);
  if (debug && mic) drawDebug(ctx, voice, game.fps);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (dt > 0) game.fps += (1 / dt - game.fps) * 0.05;

  if (mic && dt > 0) {
    const db = mic.readDb();
    game.input = { ...voice.update(db, dt), db };
    game.deadAir = db <= DEAD_AIR_DB || !mic.running ? game.deadAir + dt : 0;
  } else {
    game.input = { level: 0, flap: false, active: false, db: -100 };
  }
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---- Layout -------------------------------------------------------------

function resize() {
  const scale = Math.min(window.innerWidth / WORLD.width, window.innerHeight / WORLD.height);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(WORLD.width * scale)}px`;
  canvas.style.height = `${Math.floor(WORLD.height * scale)}px`;
  canvas.width = Math.round(WORLD.width * scale * dpr);
  canvas.height = Math.round(WORLD.height * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---- Microphone ---------------------------------------------------------

function showBootError(message) {
  bootError.textContent = message;
  bootError.hidden = false;
  bootEl.hidden = false;
  enableBtn.disabled = false;
  enableBtn.textContent = 'Try again';
}

enableBtn.addEventListener('click', async () => {
  enableBtn.disabled = true;
  enableBtn.textContent = 'Waiting for permission…';
  bootError.hidden = true;
  try {
    mic = await openMic({
      onEnded: () => {
        mic = null;
        setPhase('boot');
        showBootError('The microphone disconnected. Reconnect it and try again.');
      },
    });
    sfx = createSfx(() => mic && mic.context);
    sfx.enabled = settings.sfx;
    bootEl.hidden = true;
    recalibrateBtn.disabled = false;
    keepAwake();
    startCalibration();
  } catch (err) {
    showBootError(micErrorMessage(err));
  }
});

// ---- Settings -----------------------------------------------------------

function syncSettingsForm() {
  settingsForm.elements.mode.value = settings.mode;
  settingsForm.elements.sensitivity.value = String(settings.sensitivity);
  sensitivityOut.textContent = `${settings.sensitivity.toFixed(2)}×`;
  settingsForm.elements.sfx.checked = settings.sfx;
  settingsForm.elements.showMeter.checked = settings.showMeter;
}

function openSettings() {
  syncSettingsForm();
  settingsEl.hidden = false;
  game.paused = true;
  closeSettingsBtn.focus();
}

function closeSettings() {
  settingsEl.hidden = true;
  game.paused = false;
  if (game.phase === 'playing') game.countdown = 1.5;
  settingsBtn.focus();
}

settingsBtn.addEventListener('click', () => (settingsEl.hidden ? openSettings() : closeSettings()));
closeSettingsBtn.addEventListener('click', closeSettings);
settingsEl.addEventListener('click', (e) => {
  if (e.target === settingsEl) closeSettings();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') settingsEl.hidden ? openSettings() : closeSettings();
});

settingsForm.addEventListener('input', () => {
  const f = settingsForm.elements;
  const newMode = f.mode.value;
  settings.sensitivity = Number(f.sensitivity.value);
  settings.sfx = f.sfx.checked;
  settings.showMeter = f.showMeter.checked;
  voice.sensitivity = settings.sensitivity;
  sfx.enabled = settings.sfx;
  sensitivityOut.textContent = `${settings.sensitivity.toFixed(2)}×`;
  if (newMode !== settings.mode) {
    settings.mode = newMode;
    game.best = loadBest(newMode);
    if (game.phase === 'playing' || game.phase === 'dead' || game.phase === 'ready') goReady();
  }
  saveSettings(settings);
});
settingsForm.addEventListener('submit', (e) => e.preventDefault());

recalibrateBtn.addEventListener('click', () => {
  if (!mic) return;
  closeSettings();
  game.countdown = 0;
  startCalibration();
});

// Browsers only let audio wake up from a tap, so any tap on the game tries.
// With no sound arriving, the tap rebuilds the audio from scratch.
canvas.addEventListener('pointerdown', () => {
  if (mic) mic.wake({ rebuild: noSignal() });
  if (game.phase === 'won' && game.phaseTime > 2) goReady();
});

// Keep the phone screen on while playing: nobody can tap it mid-plank.
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !document.hidden && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* not supported or refused: the screen may dim */
  }
}

// Pausing on tab switch: browsers stop animation frames anyway; give the
// player a moment when they come back mid-run.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && mic) keepAwake();
  if (!document.hidden && game.phase === 'playing') game.countdown = 1.5;
});

// Hooks for automated tests.
if (navigator.webdriver || debug) {
  window.__screamBird = {
    get phase() {
      return game.phase;
    },
    get score() {
      return game.score;
    },
    get bird() {
      return { ...game.bird };
    },
    get level() {
      return game.input.level;
    },
    get calibration() {
      return game.calibrator && game.calibrator.result;
    },
    get noSignal() {
      return noSignal();
    },
    get diagnostics() {
      return mic && mic.diagnostics;
    },
    rebuildAudio() {
      return mic && mic.wake({ rebuild: true });
    },
    voice,
  };
}

requestAnimationFrame(frame);
