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
export async function openMic({ onEnded } = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('This browser does not support microphone input.'), { name: 'Unsupported' });
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  // Created before the await so it still counts as part of the click (Safari).
  const context = new AudioCtx();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // All three would fight the game: auto-gain flattens loud and quiet,
        // and noise suppression eats sustained screams.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  } catch (err) {
    context.close();
    throw err;
  }

  if (context.state === 'suspended') await context.resume();

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024; // ~21 ms of audio at 48 kHz
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  const [track] = stream.getAudioTracks();
  if (track && onEnded) track.addEventListener('ended', onEnded);

  return {
    context,
    label: track ? track.label : '',
    readDb() {
      analyser.getFloatTimeDomainData(buffer);
      return frameDb(buffer);
    },
    close() {
      stream.getTracks().forEach((t) => t.stop());
      context.close();
    },
  };
}
