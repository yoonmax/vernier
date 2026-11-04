import { TargetPool } from './TargetPool.js';

/** Owns the target lifecycle: every id is unique for the session and never reused. */
export class TargetManager {
  constructor(pool = new TargetPool()) {
    this.pool = pool;
    this.active = [];
    this.nextId = 1;
    /** Increases whenever the active set changes, so the renderer only re-syncs when needed. */
    this.revision = 0;
  }

  spawn(yaw, pitch, radius, time, cell = -1) {
    const target = this.pool.acquire();
    target.id = this.nextId;
    this.nextId += 1;
    target.active = true;
    target.radius = radius;
    target.spawnTime = time;
    target.cell = cell;
    target.setAngles(yaw, pitch);
    this.active.push(target);
    this.revision += 1;
    return target;
  }

  remove(target) {
    const index = this.active.indexOf(target);
    if (index === -1) return;
    const last = this.active.length - 1;
    this.active[index] = this.active[last];
    this.active.length = last;
    this.pool.release(target);
    this.revision += 1;
  }

  clear() {
    for (const target of this.active) this.pool.release(target);
    this.active.length = 0;
    this.revision += 1;
  }
}
