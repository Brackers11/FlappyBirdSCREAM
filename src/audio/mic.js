import { frameDb } from './voice.js';

/** Turn a getUserMedia failure into a message a player can act on. */
export function micErrorMessage(err) {
  if (!window.isSecureContext) {
    return 'The microphone only works over https:// or on localhost. Open the game from a secure address.';
  }
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was blocked. Allow it from the icon in your address bar, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Plug one in and try again.';
    case 'NotReadableError':
      return 'Your microphone is busy in another app. Close that app and try again.';
    default:
      return (err && err.message) || 'Could not open the microphone.';
  }
}

/**
 * Open the microphone and return a reader for its loudness.
 * Must be called from a click handler: browsers only start audio after a
 * user gesture.
 */
const AUDIO_CONSTRAINTS = {
  audio: {
    // All three would fight the game: auto-gain flattens loud and quiet,
    // and noise suppression eats sustained screams.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
};

/** mic stream -> analyser -> muted gain -> speakers */
function connect(context, stream) {
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024; // ~21 ms of audio at 48 kHz
  analyser.smoothingTimeConstant = 0;
  // Safari only processes nodes that lead to the speakers, so route the
  // analyser there through a muted gain. Nothing is audible.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(analyser);
  analyser.connect(mute);
  mute.connect(context.destination);
  return { analyser, buffer: new Float32Array(analyser.fftSize) };
}

/**
 * Open the microphone and return a reader for its loudness.
 * Must be called from a click handler: browsers only start audio after a
 * user gesture.
 */
export async function openMic({ onEnded } = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('This browser does not support microphone input.'), { name: 'Unsupported' });
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  // Created and woken before any await, while the click still counts as a
  // user gesture. Phones (iOS especially) keep it asleep otherwise.
  let context = new AudioCtx();
  const resuming = context.resume().catch(() => {});

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
  } catch (err) {
    context.close();
    throw err;
  }

  let track;
  const useStream = (s) => {
    stream = s;
    [track] = s.getAudioTracks();
    if (track && onEnded) track.addEventListener('ended', onEnded);
  };
  useStream(stream);
  let graph = connect(context, stream);

  // Never hang here: if waking needs another tap, the game asks for one.
  await Promise.race([resuming, new Promise((r) => setTimeout(r, 1000))]);
  if (context.state !== 'running') context.resume().catch(() => {});

  return {
    get context() {
      return context;
    },
    get running() {
      return context.state === 'running';
    },
    /** What the browser reports, for the no-sound warning. */
    get diagnostics() {
      return {
        audio: context.state,
        sampleRate: context.sampleRate,
        mic: !track ? 'none' : track.readyState === 'ended' ? 'ended' : track.muted ? 'muted' : 'live',
        label: track ? track.label : '',
      };
    },
    /**
     * Must be called from a tap or click. With `rebuild`, starts audio from
     * scratch: on iOS an AudioContext created after the mic opened can
     * receive sound when the first one only ever gets silence, and a mic
     * the system muted or stopped has to be requested again.
     */
    async wake({ rebuild = false } = {}) {
      if (!rebuild) return context.resume().catch(() => {});
      const fresh = new AudioCtx();
      const freshResuming = fresh.resume().catch(() => {});
      if (!track || track.readyState === 'ended' || track.muted) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
          stream.getTracks().forEach((t) => t.stop());
          useStream(s);
        } catch {
          /* keep the old stream; the warning stays up */
        }
      }
      const old = context;
      context = fresh;
      graph = connect(fresh, stream);
      old.close().catch(() => {});
      return freshResuming;
    },
    readDb() {
      graph.analyser.getFloatTimeDomainData(graph.buffer);
      return frameDb(graph.buffer);
    },
    close() {
      stream.getTracks().forEach((t) => t.stop());
      context.close();
    },
  };
}
