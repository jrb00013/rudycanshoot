import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  extractFrames,
  readVideoFrames,
  listVideos,
  cleanupVideos,
  defaultTempVideoDir,
  resolveFfmpeg,
} from "../src/video.js";
import { makeGif } from "../src/gif.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const renderScript = join(__dirname, "../src/terminal_render.py");

async function makeTestGif() {
  const frames = [];
  for (let i = 0; i < 4; i++) {
    const p = join(tmpdir(), `rudycanshoot_vid_frame_${i}.png`);
    await execFileAsync("python3", [
      renderScript,
      "--cmd",
      `echo video frame ${i}`,
      "--output",
      p,
    ]);
    frames.push(p);
  }
  const gifOut = join(tmpdir(), `rudycanshoot_video_test_${Date.now()}.gif`);
  await makeGif(frames, gifOut, { duration: 150 });
  frames.forEach((f) => {
    try {
      unlinkSync(f);
    } catch {}
  });
  return gifOut;
}

test("extractFrames pulls images from a GIF", async () => {
  const gif = await makeTestGif();
  const outDir = join(tmpdir(), `rudycanshoot_frames_out_${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  const { framePaths } = await extractFrames(gif, { maxFrames: 3, outputDir: outDir });
  assert.ok(framePaths.length >= 1 && framePaths.length <= 3);
  framePaths.forEach((p) => assert.ok(existsSync(p)));
  unlinkSync(gif);
});

test("readVideoFrames returns base64 image payloads", async () => {
  const gif = await makeTestGif();
  const viewed = await readVideoFrames(gif, { maxFrames: 2 });
  assert.equal(viewed.frames.length, viewed.framePaths.length);
  assert.ok(viewed.frames[0].base64.length > 100);
  assert.equal(viewed.frames[0].mimeType, "image/png");
  unlinkSync(gif);
});

test("listVideos + cleanupVideos work on temp dir", async () => {
  const gif = await makeTestGif();
  const destDir = defaultTempVideoDir();
  const dest = join(destDir, `cleanup-test-${Date.now()}.gif`);
  await execFileAsync("cp", [gif, dest]);
  unlinkSync(gif);

  const listed = await listVideos({ limit: 50 });
  assert.ok(listed.some((v) => v.path === dest));

  const result = await cleanupVideos({ all: false });
  assert.ok(result.removed >= 1);
  assert.ok(!existsSync(dest));
});

test("resolveFfmpeg finds or downloads a binary", async () => {
  // May download ~40MB on first Linux run without system ffmpeg — skip if offline fails.
  try {
    const bin = await resolveFfmpeg();
    assert.ok(typeof bin === "string" && bin.length > 0);
  } catch (err) {
    // Acceptable in locked-down CI without network / ffmpeg
    assert.ok(/ffmpeg/i.test(err.message));
  }
});
