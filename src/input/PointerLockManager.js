export const RawInputStatus = Object.freeze({
  UNKNOWN: 'unknown',
  ACTIVE: 'active',
  OFF: 'off',
  UNAVAILABLE: 'unavailable',
});

/**
 * Wraps the Pointer Lock API.
 *
 * Raw input is requested through `unadjustedMovement`, which bypasses OS acceleration where
 * the browser and platform support it. If that is refused, the request falls back to a
 * standard lock and reports the fact, so the settings screen can say what is really happening.
 */
export class PointerLockManager {
  /** @param {HTMLElement} element */
  constructor(element) {
    this.element = element;
    this.rawStatus = RawInputStatus.UNKNOWN;
    this.onChange = null;
    this.handleChange = () => this.onChange?.(this.isLocked());
    document.addEventListener('pointerlockchange', this.handleChange);
  }

  setElement(element) {
    this.element = element;
  }

  isSupported() {
    return typeof this.element?.requestPointerLock === 'function';
  }

  isLocked() {
    return document.pointerLockElement === this.element;
  }

  /**
   * Must be called from a user gesture such as a click.
   * @param {boolean} wantsRaw
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  async request(wantsRaw) {
    if (!this.isSupported()) {
      return { ok: false, reason: 'unsupported' };
    }
    if (this.isLocked()) return { ok: true };

    if (wantsRaw) {
      const raw = await this.attempt({ unadjustedMovement: true });
      if (raw.ok) {
        this.rawStatus = RawInputStatus.ACTIVE;
        return raw;
      }
      // The browser is briefly refusing every lock, so a second request can't succeed yet.
      if (raw.reason === 'cooldown') return raw;
      // Anything else may be the raw option itself. Safari, for one, reports it only as a generic error.
      const standard = await this.attempt();
      if (standard.ok) this.rawStatus = RawInputStatus.UNAVAILABLE;
      return standard;
    }

    const standard = await this.attempt();
    if (standard.ok) this.rawStatus = RawInputStatus.OFF;
    return standard;
  }

  async attempt(options) {
    try {
      const pending = options ? this.element.requestPointerLock(options) : this.element.requestPointerLock();
      if (pending && typeof pending.then === 'function') {
        await pending;
        return { ok: true };
      }
      // Browsers without the promise form report the outcome through events instead.
      return await this.waitForLockEvent(Boolean(options));
    } catch (error) {
      if (error?.name === 'NotSupportedError') return { ok: false, reason: 'raw-unavailable' };
      // Chrome refuses a re-lock for about a second after the player presses Escape.
      if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') {
        return { ok: false, reason: 'cooldown' };
      }
      return { ok: false, reason: 'failed' };
    }
  }

  waitForLockEvent(usedRawOption) {
    return new Promise((resolve) => {
      const finish = (outcome) => {
        clearTimeout(timer);
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        resolve(outcome);
      };
      const onChange = () => {
        if (this.isLocked()) {
          // No promise means no way of knowing that the option was honoured. Assume it wasn't.
          if (usedRawOption) this.rawStatus = RawInputStatus.UNAVAILABLE;
          finish({ ok: true, assumedStandard: usedRawOption });
        }
      };
      const onError = () => finish({ ok: false, reason: 'failed' });
      const timer = setTimeout(() => finish({ ok: false, reason: 'failed' }), 1500);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
    });
  }

  exit() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  dispose() {
    document.removeEventListener('pointerlockchange', this.handleChange);
  }
}
