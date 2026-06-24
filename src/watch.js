import { EventEmitter } from "node:events";
import { takeScreenshot, defaultOutputDir } from "./screenshot.js";
import { join } from "node:path";

export class ScreenshotWatcher extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.intervalMs = opts.intervalMs ?? 5000;
    this.outputDir = opts.outputDir ?? defaultOutputDir();
    this.mode = opts.mode ?? "fullscreen";
    this.area = opts.area ?? null;
    this.limit = opts.limit ?? Infinity;
    this._count = 0;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._tick();
    this.emit("started");
    return this;
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    clearTimeout(this._timer);
    this.emit("stopped", { count: this._count });
    return this;
  }

  async _tick() {
    if (!this._running) return;
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `watch-${String(this._count).padStart(4, "0")}-${ts}.png`;
      const path = await takeScreenshot({
        outputDir: this.outputDir,
        filename,
        window: this.mode === "window",
        area: this.mode === "area" ? this.area : null,
      });
      this._count++;
      this.emit("capture", { path, count: this._count });
      if (this._count >= this.limit) {
        this.stop();
        return;
      }
    } catch (err) {
      this.emit("error", err);
    }
    if (this._running) {
      this._timer = setTimeout(() => this._tick(), this.intervalMs);
    }
  }
}

export function watch(opts = {}) {
  return new ScreenshotWatcher(opts);
}
