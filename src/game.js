(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, GROUND = H - 80;
  const bird = new Bird();
  const pipes = new Pipes(W, H, GROUND);
  const modeSel = document.getElementById('mode');
  const sens = document.getElementById('sens');

  let state = 'needMic'; // needMic, calQuiet, calLoud, ready, play, over
  let score = 0, best = 0, t = 0, last = performance.now(), stateTime = 0, shake = 0;
  let calSamples = [];
  try { best = +localStorage.getItem('scream-best') || 0; } catch (e) {}
  try { modeSel.value = localStorage.getItem('scream-mode') || 'lift'; } catch (e) {}

  modeSel.onchange = () => { try { localStorage.setItem('scream-mode', modeSel.value); } catch (e) {} };
  sens.oninput = () => { Audio.sensitivity = +sens.value; };
  document.getElementById('recal').onclick = () => { if (Audio.ready) setState('calQuiet'); };

  function setState(s) { state = s; stateTime = 0; calSamples = []; }

  canvas.addEventListener('click', async () => {
    if (state !== 'needMic') return;
    try {
      await Audio.init();
      setState(Audio.hasCalibration() ? 'ready' : 'calQuiet');
    } catch (e) { alert('Microphone access is required to play. (' + e.message + ')'); }
  });

  function startGame() { bird.reset(); pipes.reset(); score = 0; setState('play'); }

  function die() {
    setState('over'); shake = 12;
    if (score > best) { best = score; try { localStorage.setItem('scream-best', best); } catch (e) {} }
  }

  function update(dt) {
    t += dt; stateTime += dt;
    Audio.update();
    const level = Audio.level();
    if (state === 'calQuiet') {
      calSamples.push(Audio.smooth);
      if (stateTime > 2) {
        calSamples.sort((a, b) => a - b);
        Audio.floor = calSamples[Math.floor(calSamples.length * 0.9)] || 0.01;
        setState('calLoud');
      }
    } else if (state === 'calLoud') {
      calSamples.push(Audio.smooth);
      if (stateTime > 2.5) {
        calSamples.sort((a, b) => a - b);
        const p = calSamples[Math.floor(calSamples.length * 0.9)] || 0.2;
        Audio.peak = Math.max(p, Audio.floor * 3, Audio.floor + 0.02);
        Audio.saveCalibration();
        setState('ready');
      }
    } else if (state === 'ready') {
      bird.y = 280 + Math.sin(t * 3) * 10;
      if (stateTime > 0.5 && level > 0.35) startGame();
    } else if (state === 'play') {
      bird.update(dt, level, modeSel.value, performance.now());
      pipes.update(dt, score);
      for (const p of pipes.list) if (!p.passed && p.x + p.width < bird.x) { p.passed = true; score++; }
      if (level > 0.9) shake = Math.max(shake, 3);
      if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = Math.max(0, bird.vy); }
      if (bird.y + bird.r > GROUND || pipes.hits(bird)) die();
    } else if (state === 'over') {
      if (bird.y + bird.r < GROUND) { bird.vy += 1400 * dt; bird.y = Math.min(GROUND - bird.r, bird.y + bird.vy * dt); }
      if (stateTime > 1.2 && level > 0.35) startGame();
    }
    shake *= 0.85;
  }

  function draw() {
    const level = Audio.ready ? Audio.level() : 0;
    ctx.save();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    Render.sky(ctx, W, H, t);
    Render.pipes(ctx, pipes, GROUND);
    Render.ground(ctx, W, H, GROUND, state === 'play' ? t : 0);
    Render.bird(ctx, bird, level);
    ctx.restore();
    if (Audio.ready) Render.meter(ctx, level, W - 28, 20, 160, state === 'calQuiet' || state === 'calLoud' ? null : 0.35);

    const cx = W / 2;
    if (state === 'needMic') {
      Render.text(ctx, 'SCREAM', cx, 160, 64, '#ffd23f');
      Render.text(ctx, 'Click to enable microphone', cx, 420, 22);
      Render.text(ctx, 'Your voice is the only control', cx, 455, 16);
    } else if (state === 'calQuiet') {
      Render.text(ctx, 'Calibrating…', cx, 160, 36);
      Render.text(ctx, 'Stay QUIET', cx, 420, 30, '#5bbf4a');
    } else if (state === 'calLoud') {
      Render.text(ctx, 'Now SCREAM!', cx, 160, 44, '#ff3b3b');
      Render.text(ctx, 'As loud as you will in-game', cx, 420, 18);
    } else if (state === 'ready') {
      Render.text(ctx, 'SCREAM', cx, 160, 64, '#ffd23f');
      Render.text(ctx, 'Make noise to start', cx, 420, 24);
      Render.text(ctx, modeSel.value === 'lift' ? 'Louder = higher' : 'Each shout = flap', cx, 455, 16);
    } else if (state === 'play') {
      Render.text(ctx, String(score), cx, 70, 48);
    } else if (state === 'over') {
      Render.text(ctx, 'GAME OVER', cx, 180, 48, '#ff3b3b');
      Render.text(ctx, `Score ${score}   Best ${best}`, cx, 240, 24);
      if (stateTime > 1.2) Render.text(ctx, 'Shout to play again', cx, 420, 22);
    }
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
