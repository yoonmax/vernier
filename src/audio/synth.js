/**
 * Every sound in the game is synthesised here at startup: no audio files, nothing to
 * license, and nothing to download. Each function returns mono samples in [-1, 1].
 */

const envelope = (t, attack, decay) =>
  t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/** Deterministic noise, so the sounds are identical on every load. */
function noiseSource(seed = 22222) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2147483648 - 1;
  };
}

function render(sampleRate, seconds, sampleAt) {
  const length = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = sampleAt(i / sampleRate, i);
  return normalise(samples, 0.95);
}

function normalise(samples, peak) {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  if (max > 0) {
    const scale = peak / max;
    for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  }
  return samples;
}

/** A tight, dry report: a mechanical click, a noise crack and a short low thump. */
export function gunshot(sampleRate) {
  const noise = noiseSource(7);
  let low = 0;
  let high = 0;
  return render(sampleRate, 0.22, (t) => {
    const raw = noise();
    low += (raw - low) * 0.12;
    high = raw - low;
    const crack = high * envelope(t, 0.0004, 0.009) * 0.9;
    const body = low * envelope(t, 0.001, 0.038) * 1.5;
    const pitch = 165 * Math.exp(-t * 38) + 58;
    const thump = Math.sin(2 * Math.PI * pitch * t) * envelope(t, 0.0015, 0.045) * 0.8;
    const click = Math.sin(2 * Math.PI * 3100 * t) * envelope(t, 0.0002, 0.0028) * 0.5;
    return crack + body + thump + click;
  });
}

/** A short glassy confirmation. Its bright, inharmonic partials cut through the gunshot. */
export function hit(sampleRate) {
  return render(sampleRate, 0.16, (t) => {
    const main = Math.sin(2 * Math.PI * 2093 * t) * envelope(t, 0.0006, 0.042);
    const upper = Math.sin(2 * Math.PI * 3351 * t) * envelope(t, 0.0004, 0.022) * 0.55;
    const air = Math.sin(2 * Math.PI * 5277 * t) * envelope(t, 0.0002, 0.01) * 0.25;
    const under = Math.sin(2 * Math.PI * 1047 * t) * envelope(t, 0.001, 0.03) * 0.35;
    return main + upper + air + under;
  });
}

function tone(sampleRate, frequency, seconds, decay) {
  return render(sampleRate, seconds, (t) => {
    const fundamental = Math.sin(2 * Math.PI * frequency * t);
    const overtone = Math.sin(2 * Math.PI * frequency * 2 * t) * 0.18;
    return (fundamental + overtone) * envelope(t, 0.002, decay);
  });
}

export const countdownTick = (sampleRate) => tone(sampleRate, 880, 0.2, 0.05);
export const countdownGo = (sampleRate) => tone(sampleRate, 1320, 0.34, 0.1);
export const uiHover = (sampleRate) => tone(sampleRate, 2200, 0.03, 0.006);

export function uiConfirm(sampleRate) {
  return render(sampleRate, 0.12, (t) => {
    const frequency = t < 0.04 ? 1320 : 1760;
    const local = t < 0.04 ? t : t - 0.04;
    return Math.sin(2 * Math.PI * frequency * t) * envelope(local, 0.001, 0.024);
  });
}

/** Notes in sequence, each ringing over the last. */
function arpeggio(sampleRate, notes, spacing, decay) {
  const seconds = spacing * notes.length + decay * 6;
  return render(sampleRate, seconds, (t) => {
    let sum = 0;
    notes.forEach((frequency, index) => {
      const local = t - index * spacing;
      if (local >= 0) sum += Math.sin(2 * Math.PI * frequency * local) * envelope(local, 0.003, decay);
    });
    return sum;
  });
}

export const sessionComplete = (sampleRate) => arpeggio(sampleRate, [659, 880, 1109], 0.1, 0.16);
export const personalBest = (sampleRate) => arpeggio(sampleRate, [880, 1109, 1319, 1760], 0.085, 0.2);

/** A very quiet air-handling bed. The loop point is cross-faded so it never clicks. */
export function ambientBed(sampleRate) {
  const seconds = 8;
  const noise = noiseSource(99);
  const length = sampleRate * seconds;
  const samples = new Float32Array(length);
  let low = 0;
  let lower = 0;
  for (let i = 0; i < length; i += 1) {
    const raw = noise();
    low += (raw - low) * 0.012;
    lower += (low - lower) * 0.08;
    const t = i / sampleRate;
    const hum = Math.sin(2 * Math.PI * 60 * t) * 0.012 + Math.sin(2 * Math.PI * 120 * t) * 0.005;
    samples[i] = lower * 0.9 + hum;
  }
  const fade = Math.floor(sampleRate * 0.5);
  for (let i = 0; i < fade; i += 1) {
    const mix = i / fade;
    samples[i] = samples[i] * mix + samples[length - fade + i] * (1 - mix);
  }
  return normalise(samples.subarray(0, length - fade), 0.5);
}
