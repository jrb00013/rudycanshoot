// Webcam single-frame capture.
//
// Backends:
//   dshow — Windows, and WSL2 via the Windows-side ffmpeg.exe (WSL2 has no /dev/video*)
//   v4l2  — native Linux (/dev/video*)
//
// Nothing device-specific is hardcoded: the device comes from opts / RUDYCANSHOOT_CAM_DEVICE,
// or is auto-detected as the first video device ffmpeg reports.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, openSync, readSync, closeSync } from "node:fs";
import { join, resolve, dirname, extname, isAbsolute } from "node:path";
import { platform } from "node:os";
import { defaultOutputDir } from "./screenshot.js";

const execFileAsync = promisify(execFile);

export const ENV = {
  device: "RUDYCANSHOOT_CAM_DEVICE",
  ffmpeg: "RUDYCANSHOOT_FFMPEG",
  size: "RUDYCANSHOOT_CAM_SIZE",
  backend: "RUDYCANSHOOT_CAM_BACKEND",
};

export function isWsl() {
  if (platform() !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

function v4l2Nodes() {
  try {
    return readdirSync("/dev")
      .filter((f) => /^video\d+$/.test(f))
      .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
      .map((f) => `/dev/${f}`);
  } catch {
    return [];
  }
}

/** Pick the capture backend: explicit → env → platform (WSL without /dev/video* → dshow). */
export function detectBackend(explicit) {
  const b = (explicit || process.env[ENV.backend] || "").trim().toLowerCase();
  if (b) {
    if (!["dshow", "v4l2"].includes(b)) {
      throw new Error(`Unknown webcam backend "${b}" (expected dshow or v4l2)`);
    }
    return b;
  }
  const os = platform();
  if (os === "win32") return "dshow";
  if (os === "linux") return isWsl() && v4l2Nodes().length === 0 ? "dshow" : "v4l2";
  throw new Error(`Webcam capture is not supported on ${os} (supported: Linux v4l2, Windows/WSL2 dshow)`);
}

function which(cmd) {
  try {
    const out = execFileSync(platform() === "win32" ? "where" : "which", [cmd], { stdio: ["ignore", "pipe", "ignore"] });
    return out.toString().split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

/** Read a Windows environment variable from WSL (returns a WSL path) or natively on Windows. */
function windowsEnvDir(name) {
  if (platform() === "win32") return process.env[name] || null;
  try {
    const cwd = existsSync("/mnt/c") ? "/mnt/c" : undefined; // avoid cmd.exe's UNC-cwd warning
    const raw = execFileSync("cmd.exe", ["/d", "/c", `echo %${name}%`], { cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 })
      .toString()
      .trim();
    if (!raw || raw.includes("%")) return null;
    return toWslPath(raw);
  } catch {
    return null;
  }
}

function toWslPath(p) {
  return execFileSync("wslpath", ["-u", p], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

function toWindowsPath(p) {
  return execFileSync("wslpath", ["-w", p], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
}

function newestMatch(base, segments) {
  // segments: path parts; "*" in a part matches any run of characters within one directory level.
  let dirs = [base];
  for (const seg of segments) {
    const next = [];
    for (const d of dirs) {
      if (!seg.includes("*")) {
        const p = join(d, seg);
        if (existsSync(p)) next.push(p);
        continue;
      }
      const re = new RegExp("^" + seg.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
      let entries = [];
      try {
        entries = readdirSync(d);
      } catch {}
      for (const e of entries.sort()) if (re.test(e)) next.push(join(d, e));
    }
    dirs = next;
  }
  return dirs.length ? dirs[dirs.length - 1] : null;
}

/** Common Windows install locations for ffmpeg.exe (winget, scoop, chocolatey, manual). */
function windowsFfmpegCandidates() {
  const out = [];
  const local = windowsEnvDir("LOCALAPPDATA");
  const profile = windowsEnvDir("USERPROFILE");
  const programData = windowsEnvDir("ProgramData");
  const programFiles = windowsEnvDir("ProgramFiles");
  const sysDrive = platform() === "win32" ? (process.env.SystemDrive || "C:") + "\\" : existsSync("/mnt/c") ? "/mnt/c" : null;
  if (local) {
    out.push(join(local, "Microsoft", "WinGet", "Links", "ffmpeg.exe"));
    const pkg = newestMatch(join(local, "Microsoft", "WinGet", "Packages"), ["*FFmpeg*", "ffmpeg-*", "bin", "ffmpeg.exe"]);
    if (pkg) out.push(pkg);
  }
  if (profile) out.push(join(profile, "scoop", "shims", "ffmpeg.exe"));
  if (programData) out.push(join(programData, "chocolatey", "bin", "ffmpeg.exe"));
  if (programFiles) out.push(join(programFiles, "ffmpeg", "bin", "ffmpeg.exe"));
  if (sysDrive) out.push(join(sysDrive, "ffmpeg", "bin", "ffmpeg.exe"));
  return out;
}

/**
 * Resolve the ffmpeg binary for a backend.
 * Order: explicit → RUDYCANSHOOT_FFMPEG → PATH (ffmpeg.exe for dshow, ffmpeg otherwise) → common locations.
 */
export async function resolveWebcamFfmpeg(backend, explicit) {
  const configured = explicit || process.env[ENV.ffmpeg];
  if (configured) {
    const p = isWsl() && /^[A-Za-z]:[\\/]/.test(configured) ? toWslPath(configured) : configured;
    if (existsSync(p) || which(p)) return p;
    throw new Error(`ffmpeg not found at "${configured}" (from --ffmpeg or ${ENV.ffmpeg})`);
  }
  if (backend === "dshow") {
    const onPath = which("ffmpeg.exe") || (platform() === "win32" ? which("ffmpeg") : null);
    if (onPath) return onPath;
    const hit = windowsFfmpegCandidates().find((p) => existsSync(p));
    if (hit) return hit;
    throw new Error(
      "Windows ffmpeg.exe not found (needed for dshow webcam capture). " +
        `Install it on Windows (winget install Gyan.FFmpeg) or set ${ENV.ffmpeg}=<path to ffmpeg.exe>.`
    );
  }
  const { resolveFfmpeg } = await import("./video.js");
  return resolveFfmpeg();
}

/** Parse `ffmpeg -list_devices true -f dshow -i dummy` stderr into [{ name, type, altName }]. */
export function parseDshowDevices(text) {
  const devices = [];
  let section = null; // older ffmpeg prints "DirectShow video devices" headers instead of "(video)" tags
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\[[^\]]*\]\s?/, "");
    if (/DirectShow video devices/i.test(line)) section = "video";
    else if (/DirectShow audio devices/i.test(line)) section = "audio";
    const alt = line.match(/^\s*Alternative name\s+"(.*)"\s*$/);
    if (alt) {
      if (devices.length) devices[devices.length - 1].altName = alt[1];
      continue;
    }
    const m = line.match(/^\s*"(.+)"\s*(?:\((video|audio|none)\))?\s*$/);
    if (m) devices.push({ name: m[1], type: m[2] || section || "unknown", altName: null });
  }
  return devices;
}

async function listDshow(ffmpeg) {
  let text = "";
  try {
    const r = await execFileAsync(ffmpeg, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], { timeout: 20_000 });
    text = `${r.stdout}\n${r.stderr}`;
  } catch (err) {
    text = `${err.stdout || ""}\n${err.stderr || ""}`; // ffmpeg always exits non-zero here ("dummy" can't open)
    if (!text.trim()) throw new Error(`Could not list dshow devices with ${ffmpeg}: ${err.message}`);
  }
  return parseDshowDevices(text).filter((d) => d.type === "video");
}

function listV4l2() {
  return v4l2Nodes().map((path) => {
    const sys = `/sys/class/video4linux/${path.slice(5)}`;
    const read = (f) => {
      try {
        return readFileSync(join(sys, f), "utf8").trim();
      } catch {
        return null;
      }
    };
    // Many UVC cameras expose a second (metadata) node with index 1; index 0 is the capture node.
    return { name: path, type: "video", label: read("name"), index: read("index") };
  });
}

/** List available video devices for the backend. */
export async function listWebcams(opts = {}) {
  const backend = detectBackend(opts.backend);
  if (backend === "v4l2") return { backend, ffmpeg: null, devices: listV4l2() };
  const ffmpeg = await resolveWebcamFfmpeg(backend, opts.ffmpeg);
  return { backend, ffmpeg, devices: await listDshow(ffmpeg) };
}

function pickDefault(devices) {
  return devices.find((d) => d.index === undefined || d.index === null || d.index === "0") || devices[0];
}

/** Output filename: default webcam-<timestamp>.jpg; a bare name gets .jpg appended. */
export function webcamFilename(name) {
  if (!name) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return `webcam-${ts}.jpg`;
  }
  return extname(name) ? name : `${name}.jpg`;
}

export function parseSize(size) {
  if (!size) return null;
  const s = String(size).trim().toLowerCase();
  if (!/^\d+x\d+$/.test(s)) throw new Error(`Invalid webcam size "${size}" (expected WIDTHxHEIGHT, e.g. 1280x720)`);
  return s;
}

/** Build the ffmpeg argv for one frame. `output` must already be in the form ffmpeg will see. */
export function buildCaptureArgs({ backend, device, size, output }) {
  const input = backend === "dshow" ? `video=${device}` : device;
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-f", backend,
    ...(size ? ["-video_size", size] : []),
    "-i", input,
    "-frames:v", "1",
    "-update", "1",
    "-q:v", "2",
    output,
  ];
}

export function isJpeg(path) {
  try {
    if (statSync(path).size < 3) return false;
    const fd = openSync(path, "r");
    const buf = Buffer.alloc(3);
    readSync(fd, buf, 0, 3, 0);
    closeSync(fd);
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  } catch {
    return false;
  }
}

/**
 * Capture one webcam frame as JPEG.
 * @param {object} [opts]
 * @param {string} [opts.device]    dshow device name or /dev/videoN (else RUDYCANSHOOT_CAM_DEVICE, else first detected)
 * @param {string} [opts.ffmpeg]    ffmpeg binary (else RUDYCANSHOOT_FFMPEG, else discovered)
 * @param {string} [opts.size]      WIDTHxHEIGHT (else RUDYCANSHOOT_CAM_SIZE, else camera default)
 * @param {string} [opts.backend]   dshow | v4l2 (else RUDYCANSHOOT_CAM_BACKEND, else by platform)
 * @param {string} [opts.outputDir] default ~/.rudycanshoot/captures
 * @param {string} [opts.filename]  default webcam-<timestamp>.jpg
 * @returns {Promise<{ path: string, device: string, backend: string, ffmpeg: string }>}
 */
export async function captureWebcam(opts = {}) {
  const backend = detectBackend(opts.backend);
  const ffmpeg = await resolveWebcamFfmpeg(backend, opts.ffmpeg);
  const size = parseSize(opts.size || process.env[ENV.size]);

  let device = opts.device || process.env[ENV.device];
  if (!device) {
    const devices = backend === "v4l2" ? listV4l2() : await listDshow(ffmpeg);
    const first = pickDefault(devices);
    if (!first) {
      throw new Error(
        `No ${backend} video devices found. Check the camera is connected and not disabled` +
          (backend === "dshow" ? " in Windows privacy settings" : "") +
          `, or set ${ENV.device}.`
      );
    }
    device = first.name;
  }

  const filename = webcamFilename(opts.filename);
  const outPath = isAbsolute(filename) ? filename : resolve(opts.outputDir || defaultOutputDir(), filename);
  mkdirSync(dirname(outPath), { recursive: true });

  const windowsExe = backend === "dshow" && isWsl();
  const ffOutput = windowsExe ? toWindowsPath(outPath) : outPath;
  const args = buildCaptureArgs({ backend, device, size, output: ffOutput });

  try {
    await execFileAsync(ffmpeg, args, { timeout: opts.timeoutMs || 30_000 });
  } catch (err) {
    const detail = (err.stderr || err.message || "").toString().trim().split(/\r?\n/).slice(-3).join(" | ");
    throw new Error(`Webcam capture failed (backend=${backend}, device="${device}"): ${detail}`);
  }
  if (!isJpeg(outPath)) {
    throw new Error(`Webcam capture produced no valid JPEG at ${outPath} (backend=${backend}, device="${device}")`);
  }
  return { path: outPath, device, backend, ffmpeg };
}
