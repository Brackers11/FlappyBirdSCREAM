// World constants and bird physics. No DOM access, so it can be unit tested.

export const WORLD = {
  width: 480,
  height: 720,
  ground: 90, // height of the ground strip
  get playHeight() {
    return this.height - this.ground;
  },
};

export const BIRD_X = 140;

/** Tuning per control mode. */
export const MODES = {
  // Hold a sound to rise; volume sets the push. Hovers at a level of 0.6.
  scream: {
    gravity: 1500,
    thrust: 2500,
    maxFall: 620,
    maxRise: 320,
    gapStart: 235,
    gapMin: 170,
    speedStart: 160,
    speedMax: 245,
    spacing: 290,
    maxGapShift: 170,
  },
  // Each burst of sound is one flap.
  classic: {
    gravity: 1700,
    flapVelocity: 460,
    maxFall: 700,
    maxRise: 700,
    gapStart: 210,
    gapMin: 150,
    speedStart: 170,
    speedMax: 260,
    spacing: 270,
    maxGapShift: 220,
  },
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function createBird() {
  return { x: BIRD_X, y: WORLD.playHeight * 0.45, vy: 0, r: 15, angle: 0, alive: true, wing: 0 };
}

/**
 * Advance the bird by one fixed step.
 * @param input { level: 0..1, flap: boolean }
 * @returns 'ground' if it hit the ground, otherwise null
 */
export function stepBird(bird, input, mode, dt) {
  if (bird.alive) {
    if (mode.thrust) {
      bird.vy += (mode.gravity - mode.thrust * input.level) * dt;
    } else {
      if (input.flap) bird.vy = -mode.flapVelocity;
      bird.vy += mode.gravity * dt;
    }
  } else {
    bird.vy += mode.gravity * dt;
  }
  bird.vy = clamp(bird.vy, -mode.maxRise, mode.maxFall);
  bird.y += bird.vy * dt;

  // Ceiling: stop rather than die, so a long scream is never punished.
  if (bird.y - bird.r < 0) {
    bird.y = bird.r;
    bird.vy = Math.max(0, bird.vy);
  }

  const targetAngle = bird.alive ? clamp(bird.vy * 0.0018, -0.45, 1.2) : 1.4;
  bird.angle += (targetAngle - bird.angle) * Math.min(1, dt * 10);
  bird.wing += dt * (bird.alive ? 10 + input.level * 30 : 0);

  const groundY = WORLD.playHeight;
  if (bird.y + bird.r >= groundY) {
    bird.y = groundY - bird.r;
    bird.vy = 0;
    return 'ground';
  }
  return null;
}

/** Circle vs axis-aligned rectangle overlap. */
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
