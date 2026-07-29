import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform, userInfo } from "node:os";
import { join } from "node:path";

function which(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function ensureXauthority() {
  if (process.env.XAUTHORITY && existsSync(process.env.XAUTHORITY)) return;
  const candidates = [
    join(homedir(), ".Xauthority"),
    process.env.XDG_RUNTIME_DIR && join(process.env.XDG_RUNTIME_DIR, "gdm", "Xauthority"),
    process.env.XDG_RUNTIME_DIR && join(process.env.XDG_RUNTIME_DIR, ".mutter-Xwaylandauth"),
  ].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) {
      process.env.XAUTHORITY = path;
      return;
    }
  }
  // Mutter / GNOME sometimes uses a unique auth file under XDG_RUNTIME_DIR
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime && existsSync(runtime)) {
    try {
      const hit = readdirSync(runtime).find((n) => n.includes("Xauthority") || n.includes("xauth"));
      if (hit) {
        process.env.XAUTHORITY = join(runtime, hit);
      }
    } catch {}
  }
}

function displayResponds(display) {
  const env = { ...process.env, DISPLAY: display };
  ensureXauthority();
  if (process.env.XAUTHORITY) env.XAUTHORITY = process.env.XAUTHORITY;
  const tries = [];
  if (which("xdpyinfo")) tries.push(["xdpyinfo", ["-display", display]]);
  if (which("xset")) tries.push(["xset", ["-display", display, "q"]]);
  for (const [cmd, args] of tries) {
    try {
      execFileSync(cmd, args, { stdio: "pipe", timeout: 2000, env });
      return true;
    } catch {}
  }
  // Last resort: accept the socket if no probe tools exist
  return tries.length === 0;
}

function listX11Displays() {
  const dir = "/tmp/.X11-unix";
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((n) => /^X\d+$/.test(n))
      .map((n) => `:${n.slice(1)}`)
      .sort((a, b) => {
        // Prefer :1 over :0 — local GUI sessions often land on :1 under GDM/GNOME
        const na = Number(a.slice(1));
        const nb = Number(b.slice(1));
        if (na === 0) return 1;
        if (nb === 0) return -1;
        return na - nb;
      });
  } catch {
    return [];
  }
}

function detectWaylandDisplay() {
  if (process.env.WAYLAND_DISPLAY?.trim()) return process.env.WAYLAND_DISPLAY.trim();
  const runtime =
    process.env.XDG_RUNTIME_DIR ||
    (typeof userInfo === "function" ? `/run/user/${userInfo().uid}` : null);
  if (!runtime || !existsSync(runtime)) return null;
  try {
    const sock = readdirSync(runtime).find(
      (n) => n.startsWith("wayland-") && !n.endsWith(".lock")
    );
    return sock || null;
  } catch {
    return null;
  }
}

/**
 * MCP clients often spawn the server without GUI env vars.
 * Discover and set DISPLAY / WAYLAND_DISPLAY / XAUTHORITY when missing.
 * Safe to call repeatedly.
 */
export function ensureDisplayEnv() {
  if (platform() !== "linux") return { display: process.env.DISPLAY, wayland: process.env.WAYLAND_DISPLAY };

  const existingDisplay = process.env.DISPLAY?.trim();
  const existingWayland = process.env.WAYLAND_DISPLAY?.trim();

  if (existingDisplay) {
    process.env.DISPLAY = existingDisplay;
    ensureXauthority();
    return { display: existingDisplay, wayland: existingWayland || null };
  }
  if (existingWayland) {
    process.env.WAYLAND_DISPLAY = existingWayland;
    return { display: null, wayland: existingWayland };
  }

  // Clear empty strings so tools don't see DISPLAY=""
  if (process.env.DISPLAY === "") delete process.env.DISPLAY;
  if (process.env.WAYLAND_DISPLAY === "") delete process.env.WAYLAND_DISPLAY;

  for (const display of listX11Displays()) {
    if (displayResponds(display)) {
      process.env.DISPLAY = display;
      ensureXauthority();
      return { display, wayland: null };
    }
  }

  const wayland = detectWaylandDisplay();
  if (wayland) {
    process.env.WAYLAND_DISPLAY = wayland;
    if (!process.env.XDG_RUNTIME_DIR) {
      try {
        process.env.XDG_RUNTIME_DIR = `/run/user/${userInfo().uid}`;
      } catch {}
    }
    return { display: null, wayland };
  }

  return { display: null, wayland: null };
}
