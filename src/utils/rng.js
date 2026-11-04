/**
 * Small seeded generator (mulberry32). The same seed always yields the same sequence,
 * which makes every scenario reproducible and every spawn test deterministic.
 */
export class SeededRandom {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(minInclusive, maxInclusive) {
    return Math.floor(this.range(minInclusive, maxInclusive + 1));
  }
}

export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Accepts a number or any text and returns a stable 32-bit seed. Empty input returns null. */
export function parseSeed(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
