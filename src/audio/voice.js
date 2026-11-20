// Voice signal processing. Pure functions and classes with no DOM or Web Audio
// dependencies, so they can be unit tested in Node with synthetic audio.

export const MIN_DB = -100;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Exponential smoothing coefficient for a time constant `tau` over `dt` seconds.
const smoothing = (dt, tau) => 1 - Math.exp(-dt / tau);

/** Root-mean-square loudness of a block of samples, in dBFS. */
export function frameDb(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / (samples.length || 1));
  return rms > 0 ? Math.max(MIN_DB, 20 * Math.log10(rms)) : MIN_DB;
}

/** Value at fraction `p` (0..1) of a sorted copy of `values`. */
export function percentile(values, p) {
  if (values.length === 0) return MIN_DB;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

export const VOICE_DEFAULTS = {
  attackTau: 0.012, // seconds: how fast the envelope rises
  releaseTau: 0.09, // seconds: how fast it falls back
  floorDb: -60, // background noise level until calibrated
  peakDb: -20, // loudest expected shout until calibrated
  sensitivity: 1, // >1 = less effort needed, <1 = more
  minGateDb: 6, // sound must be at least this far above the noise floor
  gateFraction: 0.22, // ...or this fraction of the floor-to-peak range
  minRangeDb: 12, // peak is always at least this far above the floor
  maxRangeDb: 70, // floor never drifts further than this below the peak
  floorDownTau: 1.5, // floor follows a quieter room quickly
  floorUpTau: 10, // ...and a louder room slowly
  burstOn: 0.35, // level that starts a burst (Classic mode flap)
  burstOff: 0.15, // level that ends it (hysteresis)
  burstCooldown: 0.12, // minimum seconds between flaps
  activeOn: 0.12,
  activeOff: 0.05,
};

/**
 * Turns per-frame loudness (dB) into a smoothed 0..1 voice level, plus
 * burst ("flap") events for Classic mode and menus.
 */
export class VoiceProcessor {
  constructor(options = {}) {
    this.o = { ...VOICE_DEFAULTS, ...options };
    this.floorDb = this.o.floorDb;
    this.peakDb = this.o.peakDb;
    this.reset();
  }

  reset() {
    this.envDb = this.floorDb;
    this.level = 0;
    this.active = false;
    this.bursting = false;
    this.sinceFlap = Infinity;
  }

  get sensitivity() {
    return this.o.sensitivity;
  }

  set sensitivity(value) {
    this.o.sensitivity = clamp(value, 0.25, 4);
  }

  setCalibration(floorDb, peakDb) {
    this.floorDb = floorDb;
    this.peakDb = Math.max(peakDb, floorDb + this.o.minRangeDb);
    this.reset();
  }

  /** Loudness below which the voice level is zero. */
  get gateDb() {
    const range = this.peakDb - this.floorDb;
    const fraction = this.o.gateFraction / this.o.sensitivity;
    return this.floorDb + Math.max(this.o.minGateDb, range * fraction);
  }

  /** Loudness at which the voice level reaches 1. */
  get topDb() {
    const gate = this.gateDb;
    return gate + Math.max(3, ((this.peakDb - gate) * 0.85) / this.o.sensitivity);
  }

  /**
   * Feed one frame of loudness.
   * @param {number} db loudness of the latest audio block (see frameDb)
   * @param {number} dt seconds since the previous frame
   */
  update(db, dt) {
    const o = this.o;
    const tau = db > this.envDb ? o.attackTau : o.releaseTau;
    this.envDb += (db - this.envDb) * smoothing(dt, tau);

    // Slowly track the room's background noise, but never while someone is
    // actually making sound.
    const gate = this.gateDb;
    if (this.envDb < this.floorDb) {
      this.floorDb += (this.envDb - this.floorDb) * smoothing(dt, o.floorDownTau);
    } else if (this.envDb < gate) {
      this.floorDb += (this.envDb - this.floorDb) * smoothing(dt, o.floorUpTau);
    }
    this.floorDb = clamp(this.floorDb, this.peakDb - o.maxRangeDb, this.peakDb - o.minRangeDb);

    const lo = this.gateDb;
    const hi = this.topDb;
    this.level = clamp((this.envDb - lo) / (hi - lo), 0, 1);

    if (!this.active && this.level >= o.activeOn) this.active = true;
    else if (this.active && this.level <= o.activeOff) this.active = false;

    this.sinceFlap += dt;
    let flap = false;
    if (!this.bursting && this.level >= o.burstOn) {
      this.bursting = true;
      if (this.sinceFlap >= o.burstCooldown) {
        flap = true;
        this.sinceFlap = 0;
      }
    } else if (this.bursting && this.level <= o.burstOff) {
      this.bursting = false;
    }

    return { db, envDb: this.envDb, level: this.level, active: this.active, flap };
  }
}

/**
 * Voice-only calibration:
 *   quiet    - measure background noise for `quietSeconds`
 *   waitLoud - wait for the player to start screaming
 *   loud     - measure the scream for `loudSeconds`
 *   done     - `result` holds { floorDb, peakDb, fallback }
 */
export class Calibrator {
  constructor({ quietSeconds = 2, loudSeconds = 1.5, loudTimeout = 10, triggerDb = 10 } = {}) {
    this.quietSeconds = quietSeconds;
    this.loudSeconds = loudSeconds;
    this.loudTimeout = loudTimeout;
    this.triggerDb = triggerDb;
    this.phase = 'quiet';
    this.time = 0;
    this.quiet = [];
    this.loud = [];
    this.floorDb = null;
    this.result = null;
  }

  /** 0..1 progress through the current phase. */
  get progress() {
    if (this.phase === 'quiet') return clamp(this.time / this.quietSeconds, 0, 1);
    if (this.phase === 'loud') return clamp(this.time / this.loudSeconds, 0, 1);
    if (this.phase === 'done') return 1;
    return 0;
  }

  update(db, dt) {
    this.time += dt;
    switch (this.phase) {
      case 'quiet':
        this.quiet.push(db);
        if (this.time >= this.quietSeconds) {
          // 90th percentile: a cough or click during the quiet phase
          // shouldn't drag the floor up much.
          this.floorDb = percentile(this.quiet, 0.9);
          this.phase = 'waitLoud';
          this.time = 0;
        }
        break;
      case 'waitLoud':
        if (db > this.floorDb + this.triggerDb) {
          this.phase = 'loud';
          this.time = 0;
          this.loud.push(db);
        } else if (this.time >= this.loudTimeout) {
          this.finish(this.floorDb + 30, true);
        }
        break;
      case 'loud':
        this.loud.push(db);
        if (this.time >= this.loudSeconds) {
          this.finish(percentile(this.loud, 0.9), false);
        }
        break;
      default:
        break;
    }
    return this.phase;
  }

  finish(peakDb, fallback) {
    this.result = { floorDb: this.floorDb, peakDb: Math.max(peakDb, this.floorDb + 15), fallback };
    this.phase = 'done';
    this.time = 0;
  }
}
