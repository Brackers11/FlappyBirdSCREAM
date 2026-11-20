// Tiny synthesized sound effects. Off by default: with echo cancellation
// disabled, speaker output leaks into the microphone and would move the bird.

/** @param getContext returns the current AudioContext (it can be rebuilt). */
export function createSfx(getContext) {
  let enabled = false;

  function blip(freq, duration, { type = 'square', volume = 0.08, slideTo = null } = {}) {
    const context = getContext();
    if (!enabled || !context || context.state === 'closed') return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  return {
    set enabled(v) {
      enabled = Boolean(v);
    },
    get enabled() {
      return enabled;
    },
    score() {
      blip(880, 0.08);
      setTimeout(() => blip(1320, 0.1), 70);
    },
    hit() {
      blip(220, 0.35, { type: 'sawtooth', volume: 0.1, slideTo: 60 });
    },
    start() {
      blip(520, 0.12, { type: 'triangle', slideTo: 1040 });
    },
  };
}
