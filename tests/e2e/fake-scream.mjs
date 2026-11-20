// Writes a WAV file that Chromium plays as a fake microphone
// (--use-file-for-fake-audio-capture). Timeline:
//   0.0–2.5 s  near-silence      -> calibration "stay quiet"
//   2.5–4.5 s  loud scream       -> calibration "now scream"
//   4.5–6.0 s  silence           -> ready screen
//   6.0 s on   shout/pause bursts -> gameplay
import { writeFileSync } from 'node:fs';

const RATE = 48000;

export function screamTimeline(seconds = 40) {
  const segments = [
    { until: 2.5, loud: false },
    { until: 4.5, loud: true },
    { until: 6.0, loud: false },
  ];
  let t = 6.0;
  while (t < seconds) {
    segments.push({ until: (t += 0.3), loud: true });
    segments.push({ until: (t += 0.45), loud: false });
  }
  return segments;
}

export function writeFakeScream(path, seconds = 40) {
  const n = Math.floor(RATE * seconds);
  const pcm = new Int16Array(n);
  const segments = screamTimeline(seconds);
  let seg = 0;
  let seed = 12345;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    while (seg < segments.length - 1 && t >= segments[seg].until) seg++;
    seed = (seed * 16807) % 2147483647;
    const hiss = ((seed / 2147483647) * 2 - 1) * 0.002;
    let v = hiss;
    if (segments[seg].loud) {
      // A buzzy, vibrato-laden "voice": sawtooth around 300 Hz.
      const freq = 300 + 25 * Math.sin(2 * Math.PI * 5 * t);
      phase += freq / RATE;
      v += 0.45 * (2 * (phase % 1) - 1);
    }
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}
