// localStorage wrapper. Storage can be missing or throw (private windows,
// blocked site data), so every call falls back quietly.

const PREFIX = 'screamBird.';

export const DEFAULT_SETTINGS = {
  mode: 'plank',
  sensitivity: 1,
  sfx: false,
  showMeter: true,
};

function read(key) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

export function loadSettings() {
  const saved = read('settings');
  const s = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  if (!['plank', 'scream', 'classic'].includes(s.mode)) s.mode = DEFAULT_SETTINGS.mode;
  s.sensitivity = Number.isFinite(s.sensitivity) ? Math.min(2, Math.max(0.5, s.sensitivity)) : 1;
  s.sfx = Boolean(s.sfx);
  s.showMeter = s.showMeter !== false;
  return s;
}

export function saveSettings(settings) {
  write('settings', settings);
}

export function loadBest(mode) {
  const v = read(`best.${mode}`);
  return Number.isFinite(v) ? v : 0;
}

export function saveBest(mode, score) {
  write(`best.${mode}`, score);
}
