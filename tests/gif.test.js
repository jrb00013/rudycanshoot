import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeGif } from "../src/gif.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const renderScript = join(__dirname, "../src/terminal_render.py");

test("makeGif creates a GIF from multiple PNGs", async () => {
  const frames = [];
  for (let i = 0; i < 3; i++) {
    const p = join(tmpdir(), `rudycanshoot_gif_frame_${i}.png`);
    await execFileAsync("python3", [
      renderScript, "--cmd", `echo frame ${i}`, "--output", p,
    ]);
    frames.push(p);
  }

  const gifOut = join(tmpdir(), "rudycanshoot_test.gif");
  await makeGif(frames, gifOut, { duration: 200 });
  assert.ok(existsSync(gifOut), "GIF should be created");

  frames.forEach((f) => unlinkSync(f));
  unlinkSync(gifOut);
});
