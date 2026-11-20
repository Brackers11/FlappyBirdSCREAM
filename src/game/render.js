// All canvas drawing. Everything is drawn in world units (WORLD.width x
// WORLD.height); main.js sets the transform to fit the screen.
import { WORLD, clamp } from './physics.js';

const W = WORLD.width;
const H = WORLD.height;
const PLAY_H = WORLD.playHeight;
const TAU = Math.PI * 2;

export const COLORS = {
  skyTop: '#1a0b3d',
  skyMid: '#5b1f6e',
  skyLow: '#e0577a',
  horizon: '#ffb36b',
  sunTop: '#fff27a',
  sunBottom: '#ff5c8a',
  farHills: '#3a1559',
  nearHills: '#24103f',
  ground: '#120826',
  grid: '#ff4f9a',
  column: '#1d1245',
  columnShade: '#130b30',
  columnEdge: '#41f2d2',
  body: '#3ee0c5',
  belly: '#b9fff1',
  wing: '#ff4f9a',
  beak: '#ffb02e',
  mouth: '#6b0f2a',
  text: '#fff6e9',
  textShadow: '#2a0b3f',
  meterOn: '#41f2d2',
  meterOff: '#8b7aa8',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

// Deterministic star field.
const STARS = Array.from({ length: 40 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { x: (a - Math.floor(a)) * W, y: (b - Math.floor(b)) * H * 0.38, phase: i * 1.7 };
});

/** Tileable ridge line: sum of sines whose periods divide `period`. */
function ridge(x, period, base, amps, phase) {
  let y = base;
  amps.forEach((a, i) => {
    y += a * Math.sin((TAU * (i + 1) * x) / period + phase * (i + 1));
  });
  return y;
}

function drawHills(ctx, scroll, factor, base, amps, phase, color) {
  const period = 960;
  const offset = scroll * factor;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, PLAY_H);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, ridge(x + offset, period, base, amps, phase));
  ctx.lineTo(W, PLAY_H);
  ctx.closePath();
  ctx.fill();
}

export function drawBackground(ctx, t, scroll) {
  const sky = ctx.createLinearGradient(0, 0, 0, PLAY_H);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(0.45, COLORS.skyMid);
  sky.addColorStop(0.8, COLORS.skyLow);
  sky.addColorStop(1, COLORS.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, PLAY_H);

  for (const s of STARS) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + s.phase);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.x, s.y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Striped sun, clipped into bands that widen towards the horizon.
  const sx = W * 0.62;
  const sy = PLAY_H * 0.62;
  const sr = 110;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, sy - sr, W, sr + 8);
  let y = sy + 8;
  for (let i = 0; i < 6; i++) {
    const gap = 3 + i * 2;
    const band = 12 - i;
    ctx.rect(0, y + gap, W, band);
    y += gap + band;
  }
  ctx.clip();
  const sun = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sun.addColorStop(0, COLORS.sunTop);
  sun.addColorStop(1, COLORS.sunBottom);
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, TAU);
  ctx.fill();
  ctx.restore();

  drawHills(ctx, scroll, 0.15, PLAY_H - 150, [28, 14, 8], 0.3, COLORS.farHills);
  drawHills(ctx, scroll, 0.35, PLAY_H - 70, [22, 12, 6, 4], 1.7, COLORS.nearHills);
}

export function drawColumns(ctx, columns) {
  for (const c of columns) {
    const top = c.gapY - c.gap / 2;
    const bottom = c.gapY + c.gap / 2;
    drawPillar(ctx, c.x, -10, c.w, top + 10, 'down', c.seed);
    drawPillar(ctx, c.x, bottom, c.w, PLAY_H - bottom, 'up', c.seed);
  }
}

function drawPillar(ctx, x, y, w, h, facing, seed) {
  if (h <= 0) return;
  const body = ctx.createLinearGradient(x, 0, x + w, 0);
  body.addColorStop(0, COLORS.columnShade);
  body.addColorStop(0.35, COLORS.column);
  body.addColorStop(1, COLORS.columnShade);
  ctx.fillStyle = body;
  ctx.fillRect(x, y, w, h);

  // Faceted crystal tip at the gap.
  const tipH = 26;
  const tipY = facing === 'up' ? y : y + h;
  const dir = facing === 'up' ? 1 : -1;
  ctx.fillStyle = COLORS.column;
  ctx.beginPath();
  ctx.moveTo(x - 6, tipY + dir * tipH);
  ctx.lineTo(x + w * 0.3, tipY);
  ctx.lineTo(x + w * 0.7, tipY);
  ctx.lineTo(x + w + 6, tipY + dir * tipH);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = COLORS.columnEdge;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 6, tipY + dir * tipH);
  ctx.lineTo(x + w * 0.3, tipY);
  ctx.lineTo(x + w * 0.7, tipY);
  ctx.lineTo(x + w + 6, tipY + dir * tipH);
  ctx.stroke();

  // Glowing seams down the body.
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 1, y);
  ctx.lineTo(x + 1, y + h);
  ctx.moveTo(x + w - 1, y);
  ctx.lineTo(x + w - 1, y + h);
  const step = 46 + Math.floor(seed * 20);
  for (let sy = tipY + dir * (tipH + 20); facing === 'up' ? sy < y + h : sy > y; sy += dir * step) {
    ctx.moveTo(x + 10, sy);
    ctx.lineTo(x + w * 0.55, sy + dir * 10);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawGround(ctx, scroll) {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, PLAY_H, W, WORLD.ground);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, PLAY_H, W, WORLD.ground);
  ctx.clip();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1.5;
  // Horizontal lines bunch up towards the horizon.
  for (let i = 1; i < 7; i++) {
    const gy = PLAY_H + (i * i * WORLD.ground) / 36;
    ctx.globalAlpha = 0.15 + i * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }
  // Vertical lines converge on a vanishing point and scroll with the world.
  ctx.globalAlpha = 0.5;
  const spacing = 48;
  const vx = W / 2;
  const offset = scroll % spacing;
  for (let gx = -W - offset; gx < W * 2; gx += spacing) {
    ctx.beginPath();
    ctx.moveTo(vx + (gx - vx) * 0.25, PLAY_H);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = COLORS.grid;
  ctx.fillRect(0, PLAY_H, W, 3);
}

/** Where the beak tip is in world space (for sound rings). */
export function beakTip(bird) {
  const cos = Math.cos(bird.angle);
  const sin = Math.sin(bird.angle);
  return { x: bird.x + 24 * cos - 2 * sin, y: bird.y + 24 * sin + 2 * cos };
}

export function drawBird(ctx, bird, level) {
  const scream = bird.alive ? level : 0;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.angle);

  // Tail feathers.
  ctx.fillStyle = COLORS.wing;
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(-27, -9);
  ctx.lineTo(-24, 0);
  ctx.lineTo(-28, 7);
  ctx.lineTo(-14, 4);
  ctx.closePath();
  ctx.fill();

  // Body.
  ctx.fillStyle = COLORS.body;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, TAU);
  ctx.fill();
  ctx.fillStyle = COLORS.belly;
  ctx.beginPath();
  ctx.ellipse(2, 8, 11, 7, 0, 0, TAU);
  ctx.fill();

  // Beak: opens with the voice level.
  const open = 0.06 + scream * 0.85;
  ctx.save();
  ctx.translate(13, 2);
  ctx.fillStyle = COLORS.mouth;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(13 * Math.cos(-open / 2), 13 * Math.sin(-open / 2));
  ctx.lineTo(13 * Math.cos(open / 2), 13 * Math.sin(open / 2));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.beak;
  for (const sign of [-1, 1]) {
    ctx.save();
    ctx.rotate((sign * open) / 2);
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-1, sign * 6);
    ctx.lineTo(14, sign * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Eye.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(6, -6, 6.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1a0b3d';
  if (bird.alive) {
    ctx.beginPath();
    ctx.arc(8, -6, 3.2 - scream * 1.6, 0, TAU);
    ctx.fill();
    // Brow tilts down as the scream gets louder.
    ctx.strokeStyle = '#1a0b3d';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1, -13 + scream * 1);
    ctx.lineTo(12, -13 + scream * 4);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#1a0b3d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3, -9);
    ctx.lineTo(9, -3);
    ctx.moveTo(9, -9);
    ctx.lineTo(3, -3);
    ctx.stroke();
  }

  // Wing.
  ctx.save();
  ctx.translate(-5, 3);
  ctx.rotate(Math.sin(bird.wing) * 0.6);
  ctx.fillStyle = COLORS.wing;
  ctx.beginPath();
  ctx.ellipse(-3, 0, 10, 6, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

export function drawParticles(ctx, particles) {
  for (const p of particles) {
    const t = p.age / p.life;
    if (p.kind === 'ring') {
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = COLORS.columnEdge;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + t * 40 * p.size, -0.7, 0.7);
      ctx.stroke();
    } else if (p.kind === 'feather') {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 2.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

export function text(ctx, str, x, y, { size = 24, align = 'center', color = COLORS.text, weight = 'bold' } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.strokeStyle = COLORS.textShadow;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Vertical volume meter: raw loudness, with the gate and full-power marks. */
export function drawMeter(ctx, voice) {
  const x = 14;
  const y = 150;
  const w = 14;
  const h = 260;
  const span = voice.peakDb - voice.floorDb;
  const toY = (db) => y + h - clamp((db - voice.floorDb) / span, 0, 1.08) * h;

  ctx.fillStyle = 'rgba(18, 8, 38, 0.65)';
  roundRect(ctx, x - 4, y - 26, w + 8, h + 34, 8);
  ctx.fill();

  const fillTop = toY(voice.envDb);
  ctx.fillStyle = voice.level > 0 ? COLORS.meterOn : COLORS.meterOff;
  ctx.fillRect(x, fillTop, w, y + h - fillTop);

  const gateY = toY(voice.gateDb);
  const topY = toY(voice.topDb);
  ctx.fillStyle = COLORS.grid;
  ctx.fillRect(x - 3, gateY - 1, w + 6, 2);
  ctx.fillStyle = COLORS.text;
  ctx.fillRect(x - 3, topY - 1, w + 6, 2);

  ctx.strokeStyle = 'rgba(255, 246, 233, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  text(ctx, 'VOL', x + w / 2, y - 13, { size: 11 });
}
