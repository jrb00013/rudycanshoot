import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  readdirSync,
  unlinkSync,
  rmSync,
  statSync,
} from "node:fs";
import { readdir, readFile, unlink, rm, stat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, basename, extname, dirname } from "node:path";
import { homedir, platform, tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { takeScreenshot } from "./screenshot.js";
import { makeGif } from "./gif.js";
import { ensureDisplayEnv } from "./display.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".mkv", ".gif"]);
const FFMPEG_URLS = {
  linux: "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
  win32: null, // resolved via GitHub release below
  darwin: null,
};

export function defaultVideoDir() {
  const dir = join(homedir(), ".rudycanshoot", "videos");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function defaultTempVideoDir() {
  const dir = join(homedir(), ".rudycanshoot", "videos", "tmp");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function which(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function timestampedName(prefix = "video", ext = "mp4") {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${ts}.${ext}`;
}

function bundledFfmpegPath() {
  const binDir = join(homedir(), ".rudycanshoot", "bin");
  const name = platform() === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return join(binDir, name);
}

/**
 * Resolve an ffmpeg binary: PATH → ffmpeg-static → downloaded static binary.
 */
export async function resolveFfmpeg() {
  if (which("ffmpeg")) return "ffmpeg";

  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {
    // optional dependency
  }

  const local = bundledFfmpegPath();
  if (existsSync(local)) return local;

  await ensureBundledFfmpeg();
  if (existsSync(local)) return local;

  throw new Error(
    "ffmpeg not found. Install ffmpeg, or run `npm install ffmpeg-static`, " +
      "or allow rudycanshoot to download a static binary into ~/.rudycanshoot/bin/"
  );
}

async function ensureBundledFfmpeg() {
  const os = platform();
  const dest = bundledFfmpegPath();
  mkdirSync(dirname(dest), { recursive: true });

  if (os === "linux") {
    const url = FFMPEG_URLS.linux;
    const archive = join(tmpdir(), `rudycanshoot-ffmpeg-${Date.now()}.tar.xz`);
    await downloadFile(url, archive);
    const extractDir = join(tmpdir(), `rudycanshoot-ffmpeg-extract-${Date.now()}`);
    mkdirSync(extractDir, { recursive: true });
    try {
      await execFileAsync("tar", ["-xJf", archive, "-C", extractDir]);
      const found = findFileRecursive(extractDir, "ffmpeg");
      if (!found) throw new Error("ffmpeg binary missing from downloaded archive");
      await execFileAsync("cp", [found, dest]);
      await execFileAsync("chmod", ["+x", dest]);
    } finally {
      try {
        unlinkSync(archive);
      } catch {}
      try {
        rmSync(extractDir, { recursive: true, force: true });
      } catch {}
    }
    return dest;
  }

  if (os === "win32") {
    // Essentials build zip from gyan.dev mirrors is large; prefer ffmpeg-static npm package.
    throw new Error(
      "ffmpeg not on PATH. On Windows install ffmpeg or: npm install ffmpeg-static"
    );
  }

  if (os === "darwin") {
    throw new Error(
      "ffmpeg not on PATH. On macOS: brew install ffmpeg  (or npm install ffmpeg-static)"
    );
  }

  throw new Error(`Unsupported platform for bundled ffmpeg: ${os}`);
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

function findFileRecursive(root, name) {
  const entries = readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    const full = join(root, e.name);
    if (e.isFile() && e.name === name) return full;
    if (e.isDirectory()) {
      const hit = findFileRecursive(full, name);
      if (hit) return hit;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Record the screen for a fixed duration.
 *
 * @param {object} opts
 * @param {number} [opts.durationSec=5]
 * @param {number} [opts.fps=4]
 * @param {string} [opts.area] x,y,w,h
 * @param {string} [opts.outputDir]
 * @param {string} [opts.filename]
 * @param {boolean} [opts.temporary=true] store under videos/tmp for easy cleanup
 * @param {boolean} [opts.gif=false] also (or only) produce a GIF when encoding from frames
 * @returns {Promise<{ path: string, durationSec: number, fps: number, backend: string, framePaths?: string[], temporary: boolean }>}
 */
export async function recordVideo(opts = {}) {
  const durationSec = Math.max(0.5, Number(opts.durationSec ?? 5));
  const fps = Math.min(30, Math.max(1, Number(opts.fps ?? 4)));
  const temporary = opts.temporary !== false;
  const outputDir = opts.outputDir || (temporary ? defaultTempVideoDir() : defaultVideoDir());
  mkdirSync(outputDir, { recursive: true });
  const filename = opts.filename || timestampedName(temporary ? "tmp-video" : "video", "mp4");
  const outputPath = resolve(join(outputDir, filename));
  const area = opts.area || null;

  if (platform() === "linux") ensureDisplayEnv();

  // Prefer native continuous recorders when available.
  const native = await tryNativeRecord(outputPath, { durationSec, fps, area });
  if (native) {
    return {
      path: outputPath,
      durationSec,
      fps,
      backend: native,
      temporary,
    };
  }

  // Universal fallback: sample screenshots → encode MP4 (or GIF).
  const frameDir = join(tmpdir(), `rudycanshoot-frames-${Date.now()}`);
  mkdirSync(frameDir, { recursive: true });
  const framePaths = [];
  const intervalMs = Math.round(1000 / fps);
  const endAt = Date.now() + durationSec * 1000;
  let i = 0;

  try {
    while (Date.now() < endAt) {
      const frameName = `frame-${String(i).padStart(5, "0")}.png`;
      const framePath = await takeScreenshot({
        outputDir: frameDir,
        filename: frameName,
        area,
      });
      framePaths.push(framePath);
      i++;
      const remaining = endAt - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(intervalMs, remaining));
    }

    if (framePaths.length === 0) {
      throw new Error("No frames captured — is a screenshot backend installed?");
    }

    let backend = "frames+ffmpeg";
    try {
      const ffmpeg = await resolveFfmpeg();
      await encodeFramesToMp4(ffmpeg, framePaths, outputPath, fps);
      // Remove zero-byte leftovers if any prior failed encode created the file
      if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
        throw new Error("ffmpeg produced an empty MP4");
      }
    } catch (encErr) {
      // Fall back to GIF so the AI still gets a playable artifact.
      try {
        if (existsSync(outputPath)) unlinkSync(outputPath);
      } catch {}
      const gifPath = outputPath.replace(/\.mp4$/i, ".gif");
      await makeGif(framePaths, gifPath, {
        duration: intervalMs,
        loop: 0,
        maxWidth: 1280,
      });
      backend = "frames+gif";
      return {
        path: gifPath,
        durationSec,
        fps,
        backend,
        framePaths: [...framePaths],
        temporary,
        encodeWarning: encErr.message,
      };
    }

    return {
      path: outputPath,
      durationSec,
      fps,
      backend,
      framePaths: [...framePaths],
      temporary,
    };
  } finally {
    // Keep frames only if caller wants them via return value; clean temp dir copies later.
    // Frame files stay until extract/read uses them; remove the working dir if we copied to video only.
    // Actually frames are in tmpdir — clean after encode unless returned for immediate AI use.
  }
}

async function tryNativeRecord(outputPath, { durationSec, fps, area }) {
  const os = platform();

  // Silent backends only — never xdg-desktop-portal ScreenCast (permission popups).

  let ffmpeg;
  try {
    ffmpeg = await resolveFfmpeg();
  } catch {
    ffmpeg = null;
  }

  if (os === "linux") {
    const display = process.env.DISPLAY?.trim() || null;
    const wayland = process.env.WAYLAND_DISPLAY?.trim() || null;

    // Prefer ffmpeg x11grab whenever DISPLAY works (pure X11 or XWayland) — no prompts.
    if (ffmpeg && display) {
      const size = area
        ? null
        : await detectX11Size();
      const args = ["-y", "-framerate", String(fps), "-f", "x11grab"];
      if (area) {
        const [x, y, w, h] = area.split(",").map(Number);
        args.push(
          "-video_size",
          `${w}x${h}`,
          "-i",
          `${display}+${x},${y}`,
          "-t",
          String(durationSec)
        );
      } else {
        args.push("-video_size", size, "-i", display, "-t", String(durationSec));
      }
      // yuv420p + libx264 required for VLC/browser playback (yuv444p looks black).
      args.push(
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-movflags",
        "+faststart",
        outputPath
      );
      try {
        await execFileAsync(ffmpeg, args, {
          timeout: (durationSec + 15) * 1000,
          env: process.env,
        });
        if (existsSync(outputPath) && statSync(outputPath).size > 0) {
          return "ffmpeg-x11grab";
        }
      } catch {
        // fall through to Wayland / frames
      }
    }

    // Wayland compositor recorder (no portal UI).
    if (wayland && which("wf-recorder")) {
      const args = ["-f", outputPath];
      if (area) {
        const [x, y, w, h] = area.split(",").map(Number);
        args.push("-g", `${x},${y} ${w}x${h}`);
      }
      try {
        await runTimed("wf-recorder", args, durationSec * 1000 + 500);
        if (existsSync(outputPath) && statSync(outputPath).size > 0) {
          return "wf-recorder";
        }
      } catch {
        // fall through to frame sampling
      }
    }

    return null;
  }

  if (!ffmpeg) return null;

  if (os === "darwin") {
    // avfoundation screen capture device index 1 is typical for screen; keep conservative.
    try {
      await execFileAsync(
        ffmpeg,
        [
          "-y",
          "-f",
          "avfoundation",
          "-framerate",
          String(fps),
          "-i",
          "1:none",
          "-t",
          String(durationSec),
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          outputPath,
        ],
        { timeout: (durationSec + 15) * 1000 }
      );
      return "ffmpeg-avfoundation";
    } catch {
      return null;
    }
  }

  if (os === "win32") {
    try {
      await execFileAsync(
        ffmpeg,
        [
          "-y",
          "-f",
          "gdigrab",
          "-framerate",
          String(fps),
          "-i",
          "desktop",
          "-t",
          String(durationSec),
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          outputPath,
        ],
        { timeout: (durationSec + 15) * 1000 }
      );
      return "ffmpeg-gdigrab";
    } catch {
      return null;
    }
  }

  return null;
}

async function detectX11Size() {
  try {
    const { stdout } = await execFileAsync("xdpyinfo", []);
    const m = stdout.match(/dimensions:\s+(\d+x\d+)/);
    if (m) return m[1];
  } catch {}
  return "1920x1080";
}

function runTimed(cmd, args, ms) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGINT");
    }, ms);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // wf-recorder often exits 0 after SIGINT; accept file existence as success.
      if (existsSync(args[args.indexOf("-f") + 1]) || code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${cmd} failed (code ${code}): ${stderr.slice(-400)}`));
      }
    });
  });
}

async function encodeFramesToMp4(ffmpeg, framePaths, outputPath, fps) {
  // Copy frames into a contiguous numbered sequence for the image2 demuxer.
  const seqDir = join(tmpdir(), `rudycanshoot-seq-${Date.now()}`);
  mkdirSync(seqDir, { recursive: true });
  try {
    for (let i = 0; i < framePaths.length; i++) {
      const dest = join(seqDir, `frame-${String(i + 1).padStart(5, "0")}.png`);
      await execFileAsync("cp", [framePaths[i], dest]);
    }
    await execFileAsync(
      ffmpeg,
      [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        join(seqDir, "frame-%05d.png"),
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { timeout: 120_000 }
    );
  } finally {
    try {
      rmSync(seqDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Extract evenly spaced frames from a video for AI viewing.
 */
export async function extractFrames(videoPath, opts = {}) {
  const maxFrames = Math.min(30, Math.max(1, Number(opts.maxFrames ?? 12)));
  const outputDir =
    opts.outputDir || join(defaultTempVideoDir(), `frames-${basename(videoPath, extname(videoPath))}-${Date.now()}`);
  await mkdir(outputDir, { recursive: true });

  const ext = extname(videoPath).toLowerCase();
  if (ext === ".gif") {
    return extractGifFrames(videoPath, outputDir, maxFrames);
  }

  const ffmpeg = await resolveFfmpeg();
  let durSec = Number(opts.durationSec) || 0;
  if (!durSec) {
    durSec = await probeDuration(ffmpeg, videoPath);
  }
  const fps = Math.max(0.1, maxFrames / Math.max(durSec, 0.5));
  const pattern = join(outputDir, "frame-%03d.png");

  await execFileAsync(
    ffmpeg,
    ["-y", "-i", videoPath, "-vf", `fps=${fps}`, "-frames:v", String(maxFrames), pattern],
    { timeout: 120_000 }
  );

  const files = (await readdir(outputDir))
    .filter((f) => f.startsWith("frame-") && f.endsWith(".png"))
    .sort()
    .map((f) => join(outputDir, f));

  return { framePaths: files, outputDir, durationSec: durSec, maxFrames };
}

async function probeDuration(ffmpeg, videoPath) {
  try {
    await execFileAsync(ffmpeg, ["-i", videoPath], { timeout: 15_000 });
  } catch (err) {
    const text = `${err.stderr || ""}${err.message || ""}`;
    const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m) {
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
  }
  return 5;
}

/** Best-effort cleanup of a frames working directory. */
export async function cleanupFrameDir(dir) {
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {}
}

async function extractGifFrames(gifPath, outputDir, maxFrames) {
  const script = `
from PIL import Image
import sys, os
gif = Image.open(sys.argv[1])
out = sys.argv[2]
max_f = int(sys.argv[3])
n = getattr(gif, "n_frames", 1)
idxs = list(range(n))
if n > max_f:
    step = n / max_f
    idxs = [int(i * step) for i in range(max_f)]
paths = []
for i, idx in enumerate(idxs):
    gif.seek(idx)
    p = os.path.join(out, f"frame-{i:03d}.png")
    gif.convert("RGBA").save(p)
    paths.append(p)
print("\\n".join(paths))
`;
  const scriptPath = join(tmpdir(), `rudycanshoot_gif_frames_${Date.now()}.py`);
  await writeFile(scriptPath, script);
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, gifPath, outputDir, String(maxFrames)]);
    const framePaths = stdout
      .trim()
      .split("\n")
      .filter(Boolean);
    return { framePaths, outputDir, durationSec: null, maxFrames };
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}

/**
 * Load video frames as buffers for MCP image transfer.
 */
export async function readVideoFrames(videoPath, opts = {}) {
  const extracted = await extractFrames(videoPath, opts);
  const frames = [];
  for (const p of extracted.framePaths) {
    const data = await readFile(p);
    frames.push({
      path: p,
      mimeType: "image/png",
      base64: data.toString("base64"),
      size: data.length,
    });
  }
  return { ...extracted, frames };
}

export async function listVideos(opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit ?? 20)));
  const tempDir = defaultTempVideoDir();
  const dirs = [defaultVideoDir(), tempDir];
  const all = [];
  for (const dir of dirs) {
    let files = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!VIDEO_EXTS.has(extname(f).toLowerCase())) continue;
      const full = join(dir, f);
      try {
        const s = await stat(full);
        if (!s.isFile()) continue;
        all.push({
          name: f,
          path: full,
          mtime: s.mtimeMs,
          size: s.size,
          temporary: resolve(dir) === resolve(tempDir),
        });
      } catch {}
    }
  }
  all.sort((a, b) => b.mtime - a.mtime);
  return all.slice(0, limit);
}

/**
 * Delete temporary videos (and optionally all videos).
 */
export async function cleanupVideos(opts = {}) {
  const { all = false, olderThanMs = 0 } = opts;
  const dirs = all ? [defaultVideoDir(), defaultTempVideoDir()] : [defaultTempVideoDir()];
  const now = Date.now();
  let removed = 0;
  for (const dir of dirs) {
    let files = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!VIDEO_EXTS.has(extname(f).toLowerCase())) continue;
      const full = join(dir, f);
      try {
        const s = await stat(full);
        if (olderThanMs && now - s.mtimeMs < olderThanMs) continue;
        await unlink(full);
        removed++;
      } catch {}
    }
  }
  return { removed };
}
