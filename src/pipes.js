class Pipes {
  constructor(w, h, ground) { this.w = w; this.h = h; this.ground = ground; this.reset(); }
  reset() { this.list = []; this.timer = 0; }
  update(dt, score) {
    const speed = 150 + Math.min(score, 30) * 4;
    const gap = Math.max(150, 210 - score * 3);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.7;
      const top = 60 + Math.random() * (this.ground - gap - 120);
      this.list.push({ x: this.w, top, gap, width: 64, passed: false });
    }
    for (const p of this.list) p.x -= speed * dt;
    this.list = this.list.filter(p => p.x + p.width > -10);
  }
  hits(b) {
    for (const p of this.list) {
      if (b.x + b.r > p.x && b.x - b.r < p.x + p.width &&
          (b.y - b.r < p.top || b.y + b.r > p.top + p.gap)) return true;
    }
    return false;
  }
}
