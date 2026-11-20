import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, MODES, createBird, stepBird, circleRect } from '../../src/game/physics.js';
import { Obstacles, difficulty, COLUMN_WIDTH } from '../../src/game/obstacles.js';

const DT = 1 / 120;

function simulate(bird, input, mode, seconds) {
  let hit = null;
  for (let t = 0; t < seconds && !hit; t += DT) hit = stepBird(bird, input, mode, DT);
  return hit;
}

/** Seeded RNG so obstacle tests are repeatable. */
function rng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

test('scream mode: silence falls, loud rises, mid level roughly hovers', () => {
  const mode = MODES.scream;
  const falling = createBird();
  const y0 = falling.y;
  simulate(falling, { level: 0 }, mode, 0.3);
  assert.ok(falling.y > y0);

  const rising = createBird();
  simulate(rising, { level: 1 }, mode, 0.3);
  assert.ok(rising.y < y0);

  const hover = createBird();
  simulate(hover, { level: mode.gravity / mode.thrust }, mode, 1);
  assert.ok(Math.abs(hover.y - y0) < 1);
});

test('classic mode: a flap gives an upward kick, then gravity wins', () => {
  const mode = MODES.classic;
  const bird = createBird();
  stepBird(bird, { level: 0, flap: true }, mode, DT);
  assert.ok(bird.vy < 0);
  simulate(bird, { level: 1, flap: false }, mode, 0.6);
  assert.ok(bird.vy > 0, 'loudness alone should not lift in classic mode');
});

test('falling silently ends on the ground', () => {
  const bird = createBird();
  assert.equal(simulate(bird, { level: 0 }, MODES.scream, 5), 'ground');
  assert.equal(bird.y + bird.r, WORLD.playHeight);
});

test('the ceiling stops the bird instead of killing it', () => {
  const bird = createBird();
  assert.equal(simulate(bird, { level: 1 }, MODES.scream, 3), null);
  assert.equal(bird.y, bird.r);
});

test('circleRect overlap', () => {
  assert.ok(circleRect(0, 0, 10, 5, -5, 10, 10));
  assert.ok(!circleRect(0, 0, 10, 11, -5, 10, 10));
  assert.ok(!circleRect(0, 0, 10, 8, 8, 10, 10)); // corner just out of reach
});

test('difficulty ramps gap down and speed up, then caps', () => {
  const m = MODES.scream;
  const d0 = difficulty(m, 0);
  const d20 = difficulty(m, 20);
  const d99 = difficulty(m, 99);
  assert.equal(d0.gap, m.gapStart);
  assert.ok(d20.gap < d0.gap && d20.speed > d0.speed);
  assert.equal(d99.gap, m.gapMin);
  assert.equal(d99.speed, m.speedMax);
});

test('columns spawn at even spacing with reachable gaps inside the world', () => {
  for (const mode of Object.values(MODES)) {
    const obs = new Obstacles(mode, rng(7));
    let prevGap = null;
    const seen = new Set();
    for (let t = 0; t < 60; t += 1 / 60) {
      obs.update(1 / 60, 0);
      for (const c of obs.columns) {
        if (seen.has(c)) continue;
        seen.add(c);
        assert.ok(c.gapY - c.gap / 2 >= 0 && c.gapY + c.gap / 2 <= WORLD.playHeight);
        if (prevGap !== null) assert.ok(Math.abs(c.gapY - prevGap) <= mode.maxGapShift + 1e-9);
        prevGap = c.gapY;
      }
      for (let i = 1; i < obs.columns.length; i++) {
        assert.ok(Math.abs(obs.columns[i].x - obs.columns[i - 1].x - mode.spacing) < 1e-6);
      }
    }
    assert.ok(seen.size > 20);
  }
});

test('bird scores once per column and collides with column bodies, not gaps', () => {
  const obs = new Obstacles(MODES.scream, rng(3));
  obs.spawn(200, 0);
  const col = obs.columns[0];
  const bird = createBird();

  bird.y = col.gapY;
  bird.x = col.x + COLUMN_WIDTH / 2;
  assert.equal(obs.hits(bird), false, 'centre of the gap is safe');

  bird.y = col.gapY - col.gap / 2 - 5;
  assert.equal(obs.hits(bird), true, 'top column');
  bird.y = col.gapY + col.gap / 2 + 5;
  assert.equal(obs.hits(bird), true, 'bottom column');

  assert.equal(obs.collectPassed(col.x + COLUMN_WIDTH + 1), 1);
  assert.equal(obs.collectPassed(col.x + COLUMN_WIDTH + 50), 0);
});
