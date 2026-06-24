import { takeScreenshot, defaultOutputDir } from "./screenshot.js";
import { makeGrid } from "./grid.js";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function scrollCapture(opts = {}) {
  const {
    scrollSteps = 5,
    scrollPixels = 500,
    delayMs = 300,
    outputDir = defaultOutputDir(),
    gridOutput = null,
  } = opts;

  const frames = [];
  for (let i = 0; i < scrollSteps; i++) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const framePath = join(outputDir, `scroll-${String(i).padStart(3, "0")}-${ts}.png`);
    await takeScreenshot({ outputDir, filename: `scroll-${String(i).padStart(3, "0")}-${ts}.png` });
    frames.push(framePath);

    if (i < scrollSteps - 1) {
      if (process.env.DISPLAY) {
        try {
          await execFileAsync("xdotool", ["key", "--clearmodifiers", "Page_Down"]);
        } catch {
          // xdotool not available — just capture without scrolling
        }
      }
      await sleep(delayMs);
    }
  }

  if (gridOutput && frames.length > 0) {
    await makeGrid(frames, gridOutput, {
      cols: Math.min(frames.length, 3),
      cellWidth: 400,
      cellHeight: 300,
    });
    return { frames, grid: gridOutput };
  }

  return { frames };
}
