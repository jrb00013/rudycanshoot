// Find an X11 window's on-screen rectangle with the stock x11-utils tools
// (xprop, xwininfo), so "window" captures work without xdotool and a window
// can be picked by title. The rectangle is handed to the area capture path.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);

/** "x,y,w,h" from `xwininfo -id <id>` output, or null. */
export function parseXwininfo(text) {
  const num = (label) => {
    const m = text.match(new RegExp(`${label}:\\s+(-?\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const x = num("Absolute upper-left X");
  const y = num("Absolute upper-left Y");
  const w = num("Width");
  const h = num("Height");
  if ([x, y, w, h].some((v) => v === null) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Window id from `xprop -root _NET_ACTIVE_WINDOW`, or null. */
export function parseActiveWindowId(text) {
  const m = text.match(/window id # (0x[0-9a-f]+)/i);
  return m && m[1] !== "0x0" ? m[1] : null;
}

/**
 * Window id whose name contains `title` (case-insensitive) from
 * `xwininfo -root -tree` output. Prefers the largest match, so a real
 * top-level window wins over a tiny child with the same name.
 */
export function findWindowIdByTitle(treeText, title) {
  const needle = title.toLowerCase();
  let best = null;
  for (const line of treeText.split("\n")) {
    const m = line.match(/^\s*(0x[0-9a-f]+)\s+"([^"]*)".*?\s(\d+)x(\d+)[+-]/i);
    if (!m) continue;
    const [, id, name, w, h] = m;
    if (!name.toLowerCase().includes(needle)) continue;
    const area = Number(w) * Number(h);
    if (area > 1 && (!best || area > best.area)) best = { id, area };
  }
  return best ? best.id : null;
}

/** Clip a rectangle to the screen size so x11grab doesn't reject it. */
export function clipToScreen(rect, screenW, screenH) {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const w = Math.min(rect.x + rect.w, screenW) - x;
  const h = Math.min(rect.y + rect.h, screenH) - y;
  if (w <= 0 || h <= 0) return null;
  // x11grab / yuv encoders want even sizes
  return { x, y, w: w - (w % 2), h: h - (h % 2) };
}

async function screenSize() {
  try {
    const { stdout } = await execFileAsync("xwininfo", ["-root"]);
    const r = parseXwininfo(stdout);
    if (r) return [r.w, r.h];
  } catch {}
  return [Infinity, Infinity];
}

const RAISE_HELPER = join(dirname(fileURLToPath(import.meta.url)), "x11_raise.py");

/** Ask the window manager to bring window `id` to the front (best effort). */
export async function raiseWindow(id) {
  try {
    await execFileAsync("python3", [RAISE_HELPER, id], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Area string "x,y,w,h" for the window titled `title` (substring match),
 * or the active window when no title is given. Throws if none is found.
 * The grab is of the screen, so a covered window shows whatever covers it;
 * pass raise=true to bring it to the front first (this changes focus).
 */
export async function resolveWindowArea({ title = null, raise = false } = {}) {
  let id = null;
  if (title) {
    const { stdout } = await execFileAsync("xwininfo", ["-root", "-tree"], { maxBuffer: 16 * 1024 * 1024 });
    id = findWindowIdByTitle(stdout, title);
    if (!id) throw new Error(`No window whose title contains "${title}"`);
  } else {
    const { stdout } = await execFileAsync("xprop", ["-root", "_NET_ACTIVE_WINDOW"]);
    id = parseActiveWindowId(stdout);
    if (!id) throw new Error("Could not determine the active window (_NET_ACTIVE_WINDOW unset)");
  }
  if (raise) await raiseWindow(id);
  const { stdout } = await execFileAsync("xwininfo", ["-id", id]);
  const rect = parseXwininfo(stdout);
  if (!rect) throw new Error(`Could not read the geometry of window ${id}`);
  const [sw, sh] = await screenSize();
  const clipped = clipToScreen(rect, sw, sh);
  if (!clipped) throw new Error(`Window ${id} is off screen`);
  return `${clipped.x},${clipped.y},${clipped.w},${clipped.h}`;
}
