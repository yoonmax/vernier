import { Target } from './Target.js';

/** Fixed pool, so rapid replacement never allocates or wakes the garbage collector. */
export class TargetPool {
  constructor(capacity = 32) {
    this.free = [];
    for (let i = 0; i < capacity; i += 1) this.free.push(new Target());
  }

  acquire() {
    return this.free.pop() ?? new Target();
  }

  release(target) {
    target.active = false;
    target.motion = null;
    target.cell = -1;
    this.free.push(target);
  }
}
