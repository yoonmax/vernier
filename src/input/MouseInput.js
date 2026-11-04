const LOCK_JUMP_COUNTS = 200;

/**
 * Turns raw browser events into aim and trigger input.
 *
 * Handlers run as soon as the browser delivers an event. Movement is applied right there,
 * and clicks fire right there, rather than being queued for the next animation frame.
 * Queuing would add up to a whole frame of latency and could separate a click from the
 * movement that came just before it.
 *
 * `pointerrawupdate`, where supported, delivers movement as it arrives rather than coalescing
 * it into one event per frame. A click therefore sees the true latest orientation.
 */
export class MouseInput {
  /**
   * @param {object} handlers
   * @param {(dx:number, dy:number) => void} handlers.onMove
   * @param {(eventTime:number) => void} handlers.onTriggerDown receives the click's own timestamp
   * @param {() => void} handlers.onTriggerUp
   */
  constructor({ onMove, onTriggerDown, onTriggerUp }) {
    this.onMove = onMove;
    this.onTriggerDown = onTriggerDown;
    this.onTriggerUp = onTriggerUp;
    this.active = false;
    this.rawEventSeen = false;
    this.skipNextMove = false;

    this.handleRawUpdate = (event) => {
      this.rawEventSeen = true;
      this.applyMovement(event);
    };
    this.handleMouseMove = (event) => {
      // Both events describe the same movement. Raw arrives first, so never count it twice.
      if (!this.rawEventSeen) this.applyMovement(event);
    };
    this.handleMouseDown = (event) => {
      if (!this.active) return;
      event.preventDefault();
      if (event.button === 0) this.onTriggerDown(event.timeStamp);
    };
    this.handleMouseUp = (event) => {
      // Stops a mouse's back and forward buttons from leaving the page in the middle of a run.
      if (this.active) event.preventDefault();
      if (event.button === 0) this.onTriggerUp();
    };
    this.blockDuringPlay = (event) => {
      if (this.active) event.preventDefault();
    };

    document.addEventListener('pointerrawupdate', this.handleRawUpdate, { passive: true });
    document.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('contextmenu', this.blockDuringPlay);
    document.addEventListener('auxclick', this.blockDuringPlay);
  }

  /** Aim and trigger only respond while pointer lock is held, so menus can never fire the gun. */
  setActive(active) {
    if (active && !this.active) this.skipNextMove = true;
    this.active = active;
  }

  applyMovement(event) {
    if (!this.active) return;
    // Some browsers report one large jump in the first event after locking. Only that jump is
    // discarded, so an ordinary first movement still counts in full.
    if (this.skipNextMove) {
      this.skipNextMove = false;
      if (Math.abs(event.movementX) > LOCK_JUMP_COUNTS || Math.abs(event.movementY) > LOCK_JUMP_COUNTS) return;
    }
    if (event.movementX !== 0 || event.movementY !== 0) {
      this.onMove(event.movementX, event.movementY);
    }
  }

  dispose() {
    document.removeEventListener('pointerrawupdate', this.handleRawUpdate);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('contextmenu', this.blockDuringPlay);
    document.removeEventListener('auxclick', this.blockDuringPlay);
  }
}
