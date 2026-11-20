// Canvas-drawn screens: calibration, ready, game over, paused.
import { WORLD } from '../game/physics.js';
import { COLORS, text, roundRect } from '../game/render.js';

const W = WORLD.width;
const CX = W / 2;

function panel(ctx, y, h) {
  ctx.fillStyle = 'rgba(18, 8, 38, 0.78)';
  roundRect(ctx, 40, y, W - 80, h, 18);
  ctx.fill();
  ctx.strokeStyle = COLORS.columnEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function progressBar(ctx, y, value, color) {
  const x = 90;
  const w = W - 180;
  ctx.fillStyle = 'rgba(255, 246, 233, 0.15)';
  roundRect(ctx, x, y, w, 12, 6);
  ctx.fill();
  if (value > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(12, w * value), 12, 6);
    ctx.fill();
  }
}

export function drawCalibration(ctx, calibrator, t) {
  panel(ctx, 190, 250);
  text(ctx, 'CALIBRATING', CX, 230, { size: 30 });
  switch (calibrator.phase) {
    case 'quiet':
      text(ctx, 'Shh… stay quiet', CX, 290, { size: 26, color: COLORS.belly });
      text(ctx, 'Measuring your room’s background noise', CX, 330, { size: 15, weight: 'normal' });
      progressBar(ctx, 370, calibrator.progress, COLORS.columnEdge);
      break;
    case 'waitLoud': {
      const pulse = 1 + 0.08 * Math.sin(t * 10);
      text(ctx, 'Now SCREAM!', CX, 295, { size: 40 * pulse, color: COLORS.beak });
      text(ctx, 'As loud as you’ll play. Shouting or singing works too.', CX, 340, { size: 14, weight: 'normal' });
      progressBar(ctx, 370, 0, COLORS.beak);
      break;
    }
    case 'loud':
      text(ctx, 'KEEP GOING!', CX, 295, { size: 40, color: COLORS.beak });
      text(ctx, 'Hold it…', CX, 340, { size: 16, weight: 'normal' });
      progressBar(ctx, 370, calibrator.progress, COLORS.beak);
      break;
    case 'done':
      text(ctx, 'Got it!', CX, 300, { size: 40, color: COLORS.columnEdge });
      if (calibrator.result && calibrator.result.fallback) {
        text(ctx, 'Didn’t hear a scream, so using defaults.', CX, 345, { size: 14, weight: 'normal' });
        text(ctx, 'Recalibrate any time in Settings.', CX, 368, { size: 14, weight: 'normal' });
      }
      break;
    default:
      break;
  }
}

export function drawReady(ctx, mode, best, t) {
  text(ctx, 'SCREAM BIRD', CX, 120, { size: 46, color: COLORS.beak });
  panel(ctx, 400, 150);
  const pulse = 1 + 0.05 * Math.sin(t * 6);
  text(ctx, 'Make some noise to start', CX, 440, { size: 24 * pulse });
  if (mode === 'scream') {
    text(ctx, 'Louder = higher. Silence = fall.', CX, 480, { size: 16, weight: 'normal' });
  } else {
    text(ctx, 'Classic mode: each shout is one flap.', CX, 480, { size: 16, weight: 'normal' });
  }
  if (best > 0) text(ctx, `Best: ${best}`, CX, 515, { size: 16, color: COLORS.belly });
}

export function drawScore(ctx, score) {
  text(ctx, String(score), CX, 70, { size: 56 });
}

export function drawGameOver(ctx, { score, best, newBest, canRestart, stillLoud, t }) {
  panel(ctx, 200, 260);
  text(ctx, 'GAME OVER', CX, 245, { size: 38, color: COLORS.grid });
  text(ctx, `Score  ${score}`, CX, 300, { size: 28 });
  text(ctx, newBest ? 'New best!' : `Best  ${best}`, CX, 340, {
    size: 20,
    color: newBest ? COLORS.beak : COLORS.belly,
  });
  if (canRestart) {
    const pulse = 1 + 0.06 * Math.sin(t * 6);
    text(ctx, stillLoud ? 'Catch your breath…' : 'Shout to fly again', CX, 405, { size: 22 * pulse, color: COLORS.columnEdge });
  }
}

export function drawCountdown(ctx, remaining) {
  panel(ctx, 280, 120);
  text(ctx, 'Get ready…', CX, 320, { size: 30 });
  text(ctx, String(Math.ceil(remaining)), CX, 365, { size: 26, color: COLORS.beak });
}

export function drawPaused(ctx) {
  panel(ctx, 300, 90);
  text(ctx, 'Paused', CX, 345, { size: 30 });
}

export function drawNoSignal(ctx, seconds, diag) {
  panel(ctx, 470, 175);
  text(ctx, 'No sound from the microphone', CX, 498, { size: 20, color: COLORS.grid });
  text(ctx, 'Tap the screen to restart the audio.', CX, 528, { size: 16, weight: 'normal' });
  text(ctx, 'Opened from a chat or social app? Open the', CX, 556, { size: 13, weight: 'normal' });
  text(ctx, 'link in Safari or Chrome instead.', CX, 574, { size: 13, weight: 'normal' });
  if (seconds > 6) text(ctx, 'Still stuck? Reload and allow mic access.', CX, 596, { size: 13, weight: 'normal' });
  if (diag) {
    text(ctx, `audio ${diag.audio} · mic ${diag.mic} · ${diag.sampleRate} Hz`, CX, 625, {
      size: 12,
      weight: 'normal',
      color: COLORS.belly,
    });
  }
}

export function drawDebug(ctx, voice, fps) {
  const lines = [
    `env ${voice.envDb.toFixed(1)} dB`,
    `floor ${voice.floorDb.toFixed(1)}  gate ${voice.gateDb.toFixed(1)}`,
    `top ${voice.topDb.toFixed(1)}  peak ${voice.peakDb.toFixed(1)}`,
    `level ${voice.level.toFixed(2)}  ${fps.toFixed(0)} fps`,
  ];
  lines.forEach((l, i) => text(ctx, l, W - 10, 640 + i * 16, { size: 11, align: 'right', weight: 'normal' }));
}
