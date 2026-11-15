// XComposite window capture -- the real fix for Xwayland environments
// (WSLg's Weston compositor is the motivating case) where root-window
// screenshot tools (scrot, xwd, ffmpeg x11grab, mss/XShmGetImage) all
// return solid black because the X11 root framebuffer is a stub under
// Xwayland. See src/native/xcomposite_capture.py for why this works.
//
// This path captures exactly ONE window (the active one, or one matching
// a name search) -- it never substitutes for a true full-virtual-screen
// capture. It only runs on Linux, only when WAYLAND_DISPLAY/DISPLAY look
// like an Xwayland session, and only as a candidate tried before the
// WSL-PowerShell-desktop fallback (which captures the wrong surface
// entirely in that environment).
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VENV_DIR = join(homedir(), ".rudycanshoot", "venv");
const SCRIPT_PATH = join(PKG_ROOT, "src", "native", "xcomposite_capture.py");
const READY_MARKER = join(VENV_DIR, ".xcomposite-ready");

function which(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function venvPython() {
  const bin = join(VENV_DIR, "bin", "python");
  return existsSync(bin) ? bin : null;
}

/** Lazily create a venv with python-xlib + Pillow. Cached via a marker
 * file so repeat captures don't pay the pip-install cost. Returns the
 * venv's python path, or null if it couldn't be set up (no python3, no
 * venv module, offline with nothing cached yet, etc.) -- callers must
 * treat null as "this backend isn't available right now", not an error. */
async function ensureVenv() {
  const existing = venvPython();
  if (existing && existsSync(READY_MARKER)) return existing;

  if (!which("python3")) return null;

  mkdirSync(dirname(VENV_DIR), { recursive: true });
  if (!existing) {
    try {
      await execFileAsync("python3", ["-m", "venv", VENV_DIR], { timeout: 30_000 });
    } catch {
      return null;
    }
  }
  const py = venvPython();
  if (!py) return null;

  try {
    await execFileAsync(py, ["-m", "pip", "install", "--quiet", "python-xlib", "pillow"], {
      timeout: 120_000,
    });
  } catch {
    return null;
  }

  try {
    mkdirSync(dirname(READY_MARKER), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(READY_MARKER, "");
  } catch {}

  return py;
}

/** True only when this looks like an Xwayland session where root-window
 * capture is known to come back black (WSLg/Weston is the case this was
 * built for). Keeps this backend from being tried -- and paying the venv
 * setup cost -- on ordinary X11 or GNOME/KDE Wayland sessions where the
 * existing tools (grim, scrot, maim) already work correctly. */
export function looksLikeBrokenRootCapture() {
  if (process.platform !== "linux") return false;
  if (!process.env.DISPLAY?.trim()) return false;
  try {
    const procVersion = readFileSync("/proc/version", "utf8");
    if (/microsoft/i.test(procVersion)) return true;
  } catch {}
  return false;
}

/** Largest-named-visible-window heuristic: Weston under WSLg doesn't set
 * _NET_ACTIVE_WINDOW (there's no real focus event in this kind of
 * session), so `xdotool getactivewindow` reliably errors out here --
 * confirmed empirically, not assumed. The practical proxy for "the
 * window the person cares about" is the biggest visible top-level
 * window.
 *
 * Two filters, both confirmed necessary empirically, not just in theory:
 * - A minimum area, because pcbnew alone opens two tiny utility windows
 *   (200x200 and 1x1) alongside its real one.
 * - A non-empty title, because WSLg's own unnamed internal surfaces
 *   (observed: an unnamed 2560x1600 window at the full virtual-screen
 *   size, and an unnamed 1280x720 one) are otherwise bigger than any real
 *   app window and win the "largest" comparison outright. They also
 *   aren't valid XComposite redirect targets -- redirecting one throws
 *   Xlib.error.BadDrawable when you then try to read its pixmap, which is
 *   how this was caught: not a guess, an observed failure. */
async function largestVisibleWindow() {
  let ids;
  try {
    const { stdout } = await execFileAsync("xdotool", ["search", "--onlyvisible", "--name", ""]);
    ids = stdout.trim().split("\n").filter(Boolean);
  } catch {
    return null;
  }
  const MIN_AREA = 100 * 100;
  let best = null;
  let bestArea = MIN_AREA;
  for (const id of ids) {
    try {
      const nameResult = await execFileAsync("xdotool", ["getwindowname", id]);
      if (!nameResult.stdout.trim()) continue;

      const { stdout } = await execFileAsync("xdotool", ["getwindowgeometry", "--shell", id]);
      const w = Number(/WIDTH=(\d+)/.exec(stdout)?.[1]);
      const h = Number(/HEIGHT=(\d+)/.exec(stdout)?.[1]);
      if (!w || !h) continue;
      const area = w * h;
      if (area > bestArea) {
        bestArea = area;
        best = id;
      }
    } catch {}
  }
  return best;
}

async function resolveWindowId(nameHint) {
  if (!which("xdotool")) return null;
  const tryIds = async (args) => {
    try {
      const { stdout } = await execFileAsync("xdotool", args);
      const id = stdout.trim().split("\n")[0];
      return id || null;
    } catch {
      return null;
    }
  };
  if (nameHint) {
    const id = await tryIds(["search", "--name", nameHint]);
    if (id) return id;
  }
  const active = await tryIds(["getactivewindow"]);
  if (active) return active;
  return largestVisibleWindow();
}

/** Attempts an XComposite capture of a window into outputPath. Returns
 * true on success, false if this backend isn't usable right now (missing
 * deps, no matching window, capture error) -- callers fall through to
 * their next backend on false, exactly like the other capture*() helpers
 * in screenshot.js. */
export async function captureViaXComposite(outputPath, opts = {}) {
  const { nameHint = null } = opts;

  const windowId = await resolveWindowId(nameHint);
  if (!windowId) return false;

  const py = await ensureVenv();
  if (!py) return false;

  const windowIdHex = "0x" + Number(windowId).toString(16);
  try {
    await execFileAsync(py, [SCRIPT_PATH, windowIdHex, outputPath], {
      timeout: 15_000,
      env: process.env,
    });
    return existsSync(outputPath);
  } catch {
    return false;
  }
}
