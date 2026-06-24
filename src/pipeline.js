import { takeScreenshot } from "./screenshot.js";
import { annotateImage } from "./annotate.js";
import { redactRegions } from "./redact.js";
import { addWatermark } from "./watermark.js";
import { addBorder } from "./border.js";
import { cropImage, resizeImage } from "./crop.js";
import { recordCapture } from "./history.js";
import { join, dirname, basename, extname } from "node:path";
import { tmpdir } from "node:os";

let _stepCounter = 0;

function tmpStep(inputPath, suffix) {
  const ext = extname(inputPath) || ".png";
  return join(tmpdir(), `rcs_pipeline_${_stepCounter++}_${suffix}${ext}`);
}

export class Pipeline {
  constructor(inputPath) {
    this._path = inputPath;
    this._steps = [];
  }

  static async capture(opts = {}) {
    const path = await takeScreenshot(opts);
    return new Pipeline(path);
  }

  annotate(text, opts = {}) {
    this._steps.push(async (p) => {
      const out = tmpStep(p, "annotated");
      const { annotateImage: fn } = await import("./annotate.js");
      await fn(p, out, { text, ...opts });
      return out;
    });
    return this;
  }

  redact(regions, opts = {}) {
    this._steps.push(async (p) => {
      const out = tmpStep(p, "redacted");
      await redactRegions(p, out, regions, opts);
      return out;
    });
    return this;
  }

  watermark(text, opts = {}) {
    this._steps.push(async (p) => {
      const out = tmpStep(p, "watermarked");
      await addWatermark(p, out, text, opts);
      return out;
    });
    return this;
  }

  border(opts = {}) {
    this._steps.push(async (p) => {
      const out = tmpStep(p, "bordered");
      await addBorder(p, out, opts);
      return out;
    });
    return this;
  }

  crop(x, y, w, h) {
    this._steps.push(async (p) => {
      const out = tmpStep(p, "cropped");
      await cropImage(p, out, x, y, w, h);
      return out;
    });
    return this;
  }

  resize(width, height) {
    this._steps.push(async (p) => {
      const out = tmpStep(p, "resized");
      await resizeImage(p, out, width, height);
      return out;
    });
    return this;
  }

  async save(outputPath, meta = {}) {
    let current = this._path;
    for (const step of this._steps) {
      current = await step(current);
    }
    const { copyFile } = await import("node:fs/promises");
    await copyFile(current, outputPath);
    await recordCapture(outputPath, meta);
    return outputPath;
  }
}
