const Render = {
  sky(ctx, w, h, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff7e5f'); g.addColorStop(1, '#2b1055');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 110 - t * 20) % (w + 120) + w + 120) % (w + 120) - 60;
      ctx.beginPath(); ctx.arc(x, 80 + i * 37 % 120, 30, 0, 7); ctx.fill();
    }
  },
  ground(ctx, w, h, gy, t) {
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = '#5bbf4a'; ctx.fillRect(0, gy, w, 10);
    ctx.fillStyle = '#4aa83b';
    for (let x = -((t * 150) % 24); x < w; x += 24) ctx.fillRect(x, gy + 10, 12, 4);
  },
  pipes(ctx, pipes, gy) {
    for (const p of pipes.list) {
      ctx.fillStyle = '#6c3ad8'; ctx.strokeStyle = '#2a1060'; ctx.lineWidth = 3;
      ctx.fillRect(p.x, 0, p.width, p.top); ctx.strokeRect(p.x, -5, p.width, p.top + 5);
      const by = p.top + p.gap;
      ctx.fillRect(p.x, by, p.width, gy - by); ctx.strokeRect(p.x, by, p.width, gy - by);
      ctx.fillRect(p.x - 6, p.top - 20, p.width + 12, 20); ctx.strokeRect(p.x - 6, p.top - 20, p.width + 12, 20);
      ctx.fillRect(p.x - 6, by, p.width + 12, 20); ctx.strokeRect(p.x - 6, by, p.width + 12, 20);
    }
  },
  bird(ctx, b, level) {
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.rotate(Math.max(-0.5, Math.min(1.2, b.vy / 600)));
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.fill(); ctx.stroke();
    // wing
    ctx.fillStyle = '#f4a300';
    ctx.beginPath(); ctx.ellipse(-6, 4 - level * 8, 9, 5, -0.4, 0, 7); ctx.fill(); ctx.stroke();
    // eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -6, 6, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(8, -6, 2 + level * 2, 0, 7); ctx.fill();
    // mouth opens with volume
    ctx.fillStyle = level > 0.6 ? '#c00' : '#ff6b35';
    ctx.beginPath(); ctx.ellipse(14, 4, 7, 2 + level * 7, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  meter(ctx, level, x, y, h, threshold) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x, y, 14, h);
    ctx.fillStyle = level > 0.7 ? '#ff3b3b' : level > 0.3 ? '#ffd23f' : '#5bbf4a';
    ctx.fillRect(x, y + h * (1 - level), 14, h * level);
    if (threshold != null) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y + h * (1 - threshold), 20, 2); }
  },
  text(ctx, s, x, y, size, color = '#fff') {
    ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(3, size / 8); ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.strokeText(s, x, y);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  },
};
