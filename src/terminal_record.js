// terminal_record.js — record a TERMINAL SESSION (not the desktop) as a GIF/MP4.
//
// Runs a command, samples its output over time, renders each frame with terminal_render.py, and
// encodes the frames with real (idle-capped) timing. Unlike record_video (which screen-captures the
// desktop), this captures just the terminal — no desktop, no private windows, works headless (WSL,
// SSH, CI). Ideal for demoing CLI programs.

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { defaultVideoDir, defaultTempVideoDir } from "./video.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDER_PY = join(__dirname, "terminal_render.py");

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

function timestamped(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `terminal-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

// Keep the visible "window": last `rows` lines, each clipped to `cols` columns, ANSI stripped.
function tailView(buffer, rows, cols) {
  const clean = buffer.replace(ANSI, "").replace(/\r/g, "");
  const lines = clean.split("\n");
  const tail = lines.slice(Math.max(0, lines.length - rows));
  return tail.map((l) => (l.length > cols ? l.slice(0, cols) : l)).join("\n");
}

// Variable-per-frame-duration GIF encoder (PIL supports a duration list; gif.js only does fixed).
const GIF_PY = `
import sys, json
from PIL import Image
paths = json.loads(sys.argv[1]); out = sys.argv[2]
durations = json.loads(sys.argv[3]); loop = int(sys.argv[4]); max_w = int(sys.argv[5])
imgs = [Image.open(p).convert("RGB") for p in paths]
if not imgs:
    print("no frames", file=sys.stderr); sys.exit(1)
# GIF frames must share one size — pad each onto a common canvas (terminal bg color, top-left pixel).
W = max(i.width for i in imgs); H = max(i.height for i in imgs)
bg = imgs[0].getpixel((0, 0))
frames = []
for im in imgs:
    canvas = Image.new("RGB", (W, H), bg)
    canvas.paste(im, (0, 0))
    if W > max_w:
        r = max_w / W; canvas = canvas.resize((max_w, int(H * r)), Image.LANCZOS)
    frames.append(canvas)
frames[0].save(out, format="GIF", save_all=True, append_images=frames[1:],
               duration=durations, loop=loop, optimize=True, disposal=2)
print(out)
`;

async function encodeGif(pngPaths, durationsMs, outputPath, maxWidth) {
  const scriptPath = join(tmpdir(), `rcs_termgif_${process.pid}.py`);
  await writeFile(scriptPath, GIF_PY);
  try {
    await execFileAsync("python3", [
      scriptPath,
      JSON.stringify(pngPaths),
      outputPath,
      JSON.stringify(durationsMs),
      "0",
      String(maxWidth),
    ]);
  } finally {
    await rm(scriptPath, { force: true }).catch(() => {});
  }
  return outputPath;
}

/**
 * Record a terminal session to a GIF.
 * @param {string} command  shell command to run and record
 * @param {object} opts
 * @returns {{path,frames,durationMs,command}}
 */
export async function recordTerminalSession(command, opts = {}) {
  const {
    output = null,
    fontSize = 15,
    sampleMs = 400, // snapshot cadence
    idleCapMs = 1500, // collapse long unchanged stretches (e.g. a model load) to this
    maxWidth = 1000,
    rows = 32,
    cols = 110,
    title = `$ ${command}`,
    temporary = true,
    timeoutSec = 600,
  } = opts;

  const workDir = await mkdtemp(join(tmpdir(), "rcs_term_"));
  const frameDir = join(workDir, "frames");
  await mkdir(frameDir, { recursive: true });

  // 1) run the command, accumulate timed output
  let buffer = "";
  const startedAt = Date.now();
  const samples = [];
  const child = spawn("bash", ["-lc", command], { env: process.env });
  const onData = (d) => {
    buffer += d.toString();
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  const snap = () => samples.push({ t: Date.now() - startedAt, text: tailView(buffer, rows, cols) });
  const iv = setInterval(snap, sampleMs);
  const killer = setTimeout(() => child.kill("SIGKILL"), timeoutSec * 1000);
  await new Promise((res) => child.on("close", res));
  clearInterval(iv);
  clearTimeout(killer);
  snap(); // final frame

  // 2) collapse identical consecutive snapshots -> frames with idle-capped durations
  const frames = [];
  for (let i = 0; i < samples.length; i++) {
    const dur = samples[i + 1] ? samples[i + 1].t - samples[i].t : sampleMs;
    const last = frames[frames.length - 1];
    if (last && last.text === samples[i].text) {
      last.durMs = Math.min(last.durMs + dur, idleCapMs);
    } else {
      frames.push({ text: samples[i].text, durMs: Math.min(dur, idleCapMs) });
    }
  }

  // 3) render each frame's text -> PNG via the existing terminal renderer
  const pngPaths = [];
  for (let i = 0; i < frames.length; i++) {
    const txt = join(frameDir, `f${String(i).padStart(4, "0")}.txt`);
    const png = join(frameDir, `f${String(i).padStart(4, "0")}.png`);
    await writeFile(txt, frames[i].text || " ");
    await execFileAsync("python3", [
      RENDER_PY,
      "--input", txt,
      "--output", png,
      "--title", title,
      "--font-size", String(fontSize),
    ]);
    pngPaths.push(png);
  }

  // 4) encode GIF with real per-frame timing
  const durations = frames.map((f) => Math.max(40, Math.round(f.durMs)));
  const outPath =
    output || join(temporary ? defaultTempVideoDir() : defaultVideoDir(), timestamped("gif"));
  await mkdir(dirname(outPath), { recursive: true });
  await encodeGif(pngPaths, durations, outPath, maxWidth);

  await rm(workDir, { recursive: true, force: true }).catch(() => {});
  return {
    path: outPath,
    frames: frames.length,
    durationMs: samples.length ? samples[samples.length - 1].t : 0,
    command,
  };
}
