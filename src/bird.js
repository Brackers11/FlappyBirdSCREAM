class Bird {
  constructor() { this.reset(); }
  reset() { this.x = 100; this.y = 280; this.vy = 0; this.r = 16; this.lastFlap = 0; }
  update(dt, level, mode, now) {
    const G = 1400;
    if (mode === 'lift') {
      this.vy += (G - level * 3200) * dt;
    } else {
      this.vy += G * dt;
      if (level > 0.25 && now - this.lastFlap > 250) { this.vy = -420; this.lastFlap = now; }
    }
    this.vy = Math.max(-500, Math.min(600, this.vy));
    this.y += this.vy * dt;
  }
}
