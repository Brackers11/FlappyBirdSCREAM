import { WORLD, clamp, lerp, circleRect } from './physics.js';

export const COLUMN_WIDTH = 78;
const EDGE_MARGIN = 60; // gaps never touch the ceiling or the ground
const FULL_DIFFICULTY_SCORE = 40;

/** Gap size and scroll speed for the current score. */
export function difficulty(mode, score) {
  const t = clamp(score / FULL_DIFFICULTY_SCORE, 0, 1);
  return {
    gap: lerp(mode.gapStart, mode.gapMin, t),
    speed: lerp(mode.speedStart, mode.speedMax, t),
  };
}

export class Obstacles {
  constructor(mode, rng = Math.random) {
    this.mode = mode;
    this.rng = rng;
    this.columns = [];
    this.lastGapY = WORLD.playHeight / 2;
    this.speed = mode.speedStart;
  }

  /** Pick a gap centre that is reachable from the previous one. */
  nextGapY(gap) {
    const min = EDGE_MARGIN + gap / 2;
    const max = WORLD.playHeight - EDGE_MARGIN - gap / 2;
    const lo = Math.max(min, this.lastGapY - this.mode.maxGapShift);
    const hi = Math.min(max, this.lastGapY + this.mode.maxGapShift);
    const y = lo + this.rng() * (hi - lo);
    this.lastGapY = y;
    return y;
  }

  spawn(x, score) {
    const { gap } = difficulty(this.mode, score);
    this.columns.push({ x, w: COLUMN_WIDTH, gap, gapY: this.nextGapY(gap), passed: false, seed: this.rng() });
  }

  /** Scroll columns, spawn new ones and drop old ones. Returns distance moved. */
  update(dt, score) {
    this.speed = difficulty(this.mode, score).speed;
    const dx = this.speed * dt;
    for (const c of this.columns) c.x -= dx;

    const last = this.columns[this.columns.length - 1];
    if (!last) this.spawn(WORLD.width + 60, score);
    else if (last.x <= WORLD.width - this.mode.spacing) this.spawn(last.x + this.mode.spacing, score);

    while (this.columns.length && this.columns[0].x + this.columns[0].w < -20) this.columns.shift();
    return dx;
  }

  /** Number of columns the bird has newly flown past. */
  collectPassed(birdX) {
    let count = 0;
    for (const c of this.columns) {
      if (!c.passed && c.x + c.w < birdX) {
        c.passed = true;
        count++;
      }
    }
    return count;
  }

  hits(bird) {
    // Slightly smaller than the drawn bird so near misses feel fair.
    const r = bird.r * 0.85;
    for (const c of this.columns) {
      const top = c.gapY - c.gap / 2;
      const bottom = c.gapY + c.gap / 2;
      if (circleRect(bird.x, bird.y, r, c.x, -1000, c.w, top + 1000)) return true;
      if (circleRect(bird.x, bird.y, r, c.x, bottom, c.w, WORLD.playHeight - bottom)) return true;
    }
    return false;
  }
}
