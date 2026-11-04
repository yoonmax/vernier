import * as synth from './synth.js';

const VOICE_COUNT = 12;
/** Browsers resample buffers to the output rate, so sounds can be made before a device exists. */
const SYNTH_RATE = 48000;

/** In order of importance during play, so the ambient bed, the slowest, is the one left waiting. */
const SOUNDS = Object.freeze({
  gunshot: synth.gunshot,
  hit: synth.hit,
  countdownTick: synth.countdownTick,
  countdownGo: synth.countdownGo,
  uiHover: synth.uiHover,
  uiConfirm: synth.uiConfirm,
  sessionComplete: synth.sessionComplete,
  personalBest: synth.personalBest,
  ambient: synth.ambientBed,
});

/**
 * Sound playback with low latency. Buffers are synthesised once at startup and a small
 * pool of voices is reused for rapid repeats. Web Audio's source nodes are single-use by
 * design and cheap to create, so each play makes one and connects it to a pooled gain.
 *
 * The game works identically if audio can't start; every call simply does nothing.
 */
export class AudioManager {
  constructor() {
    this.context = null;
    this.buffers = {};
    // Synthesising every sound takes well over 100 ms, which would freeze the first click if it
    // happened then. So each is made separately, in a spare moment after the page loads.
    this.samples = {};
    this.pending = Object.keys(SOUNDS);
    this.prepareTimer = setTimeout(() => this.prepareNextSound(), 0);
    this.voices = [];
    this.nextVoice = 0;
    this.buses = {};
    this.volumes = { master: 0.8, gunshot: 0.6, hit: 0.8, ui: 0.5, ambient: false };
    this.ambientSource = null;
    this.contactGain = null;
    this.handleGesture = () => this.unlock();
    window.addEventListener('pointerdown', this.handleGesture, { capture: true });
    window.addEventListener('keydown', this.handleGesture, { capture: true });
  }

  prepareNextSound() {
    const name = this.pending.shift();
    if (name) this.samples[name] = SOUNDS[name](SYNTH_RATE);
    if (this.pending.length > 0) this.prepareTimer = setTimeout(() => this.prepareNextSound(), 0);
  }

  /** Browsers only allow audio to start from a user gesture. */
  unlock() {
    if (!this.context) this.initialise();
    if (this.context?.state === 'suspended') this.context.resume();
    if (this.context?.state === 'running' || this.context) {
      window.removeEventListener('pointerdown', this.handleGesture, { capture: true });
      window.removeEventListener('keydown', this.handleGesture, { capture: true });
    }
  }

  initialise() {
    const Context = window.AudioContext ?? window.webkitAudioContext;
    if (!Context) return;
    try {
      this.context = new Context({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const { context } = this;

    const master = context.createGain();
    master.connect(context.destination);
    const bus = () => {
      const gain = context.createGain();
      gain.connect(master);
      return gain;
    };
    this.buses = { master, gunshot: bus(), hit: bus(), ui: bus(), ambient: bus() };

    // A click right after loading can arrive before the spare moments did.
    clearTimeout(this.prepareTimer);
    while (this.pending.length > 0) this.prepareNextSound();
    for (const [name, samples] of Object.entries(this.samples)) {
      const buffer = context.createBuffer(1, samples.length, SYNTH_RATE);
      buffer.copyToChannel(samples, 0);
      this.buffers[name] = buffer;
    }
    this.samples = {};

    for (let i = 0; i < VOICE_COUNT; i += 1) {
      this.voices.push({ gain: context.createGain(), source: null, bus: null });
    }

    // A continuous soft tone that tells a hold-to-track player they are on target.
    const contactOscillator = context.createOscillator();
    contactOscillator.type = 'sine';
    contactOscillator.frequency.value = 1046.5;
    this.contactGain = context.createGain();
    this.contactGain.gain.value = 0;
    contactOscillator.connect(this.contactGain);
    this.contactGain.connect(this.buses.hit);
    contactOscillator.start();

    this.applyVolumes();
  }

  configure(volumes) {
    this.volumes = volumes;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.context) return;
    const { master, gunshot, hit, ui, ambient } = this.volumes;
    this.buses.master.gain.value = master;
    this.buses.gunshot.gain.value = gunshot;
    this.buses.hit.gain.value = hit;
    this.buses.ui.gain.value = ui;
    this.buses.ambient.gain.value = 0.16;
    this.setAmbient(ambient);
  }

  setAmbient(enabled) {
    if (enabled && !this.ambientSource) {
      const source = this.context.createBufferSource();
      source.buffer = this.buffers.ambient;
      source.loop = true;
      source.connect(this.buses.ambient);
      source.start();
      this.ambientSource = source;
    } else if (!enabled && this.ambientSource) {
      this.ambientSource.stop();
      this.ambientSource = null;
    }
  }

  /**
   * @param {string} name buffer name
   * @param {'gunshot'|'hit'|'ui'} busName
   * @param {number} [volume]
   */
  play(name, busName, volume = 1) {
    if (!this.context) return;
    if (this.context.state !== 'running') {
      // The system can suspend audio, for example when the output device changes.
      this.context.resume();
      return;
    }
    const buffer = this.buffers[name];
    if (!buffer) return;

    const voice = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % VOICE_COUNT;
    if (voice.source) {
      // Stealing the oldest voice. It has almost certainly finished already.
      try {
        voice.source.stop();
      } catch {
        // Already stopped.
      }
      voice.source.disconnect();
    }
    if (voice.bus !== busName) {
      voice.gain.disconnect();
      voice.gain.connect(this.buses[busName]);
      voice.bus = busName;
    }
    voice.gain.gain.value = volume;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(voice.gain);
    source.start();
    voice.source = source;
  }

  setContact(onTarget) {
    if (!this.contactGain) return;
    const target = onTarget ? 0.11 : 0;
    this.contactGain.gain.setTargetAtTime(target, this.context.currentTime, 0.012);
  }

  dispose() {
    clearTimeout(this.prepareTimer);
    window.removeEventListener('pointerdown', this.handleGesture, { capture: true });
    window.removeEventListener('keydown', this.handleGesture, { capture: true });
    this.context?.close();
  }
}
