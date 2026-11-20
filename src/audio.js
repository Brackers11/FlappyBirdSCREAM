// Microphone input: RMS volume, smoothing, calibration.
const Audio = {
  ready: false, analyser: null, buf: null,
  raw: 0, smooth: 0, floor: 0.01, peak: 0.2, sensitivity: 1,

  async init() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    src.connect(this.analyser);
    this.ready = true;
    const saved = localStorage.getItem('scream-cal');
    if (saved) { try { Object.assign(this, JSON.parse(saved)); } catch (e) {} }
  },

  update() {
    if (!this.ready) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    this.raw = Math.sqrt(sum / this.buf.length);
    const a = this.raw > this.smooth ? 0.5 : 0.15; // fast attack, slower release
    this.smooth += (this.raw - this.smooth) * a;
  },

  // Normalized 0..1 between noise floor and calibrated peak.
  level() {
    const range = Math.max(this.peak - this.floor, 0.005);
    const v = ((this.smooth - this.floor * 1.5) / range) * this.sensitivity;
    return Math.max(0, Math.min(1, v));
  },

  hasCalibration() { return !!localStorage.getItem('scream-cal'); },
  saveCalibration() {
    try { localStorage.setItem('scream-cal', JSON.stringify({ floor: this.floor, peak: this.peak })); } catch (e) {}
  },
};
