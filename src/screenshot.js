import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { ensureDisplayEnv } from "./display.js";

const execFileAsync = promisify(execFile);

export function defaultOutputDir() {
  const dir = join(homedir(), ".rudycanshoot", "captures");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampedName(prefix = "screenshot") {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${ts}.png`;
}

function which(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function powershellExe() {
  if (which("powershell.exe")) return "powershell.exe";
  const fallback = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  return existsSync(fallback) ? fallback : null;
}

async function toWindowsPath(linuxPath) {
  try {
    const { stdout } = await execFileAsync("wslpath", ["-w", linuxPath]);
    return stdout.trim();
  } catch {
    if (linuxPath.startsWith("/mnt/") && linuxPath.length > 6 && linuxPath[6] === "/") {
      const drive = linuxPath[5];
      return `${drive.toUpperCase()}:${linuxPath.slice(6).replace(/\//g, "\\")}`;
    }
    return null;
  }
}

/**
 * WSL → Windows desktop capture via System.Drawing (works when Linux
 * screenshot tools are missing but the Windows host is available).
 */
async function captureViaWindowsPowershell(outputPath, opts = {}) {
  const ps = powershellExe();
  if (!ps) return false;

  let winPath = await toWindowsPath(outputPath);
  let tempWin = null;
  if (!winPath) {
    tempWin = `C:\\Windows\\Temp\\rudycanshoot-${Date.now()}.png`;
    winPath = tempWin;
  }

  const { area = null } = opts;
  let crop = "";
  if (area) {
    const [x, y, w, h] = area.split(",").map(Number);
    crop = `
$bmp2 = New-Object System.Drawing.Bitmap ${w}, ${h}
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.DrawImage($bmp, 0, 0, (New-Object System.Drawing.Rectangle ${x},${y},${w},${h}), [System.Drawing.GraphicsUnit]::Pixel)
$g2.Dispose(); $bmp.Dispose(); $bmp = $bmp2
`;
  }

  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$g.Dispose()
${crop}
$bmp.Save('${winPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`.trim();

  try {
    await execFileAsync(ps, ["-NoProfile", "-Command", script], { timeout: 30_000 });
  } catch {
    return false;
  }

  if (tempWin) {
    try {
      const { stdout } = await execFileAsync(ps, [
        "-NoProfile",
        "-Command",
        `[Convert]::ToBase64String([IO.File]::ReadAllBytes('${tempWin}'))`,
      ]);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outputPath, Buffer.from(stdout.trim(), "base64"));
      await execFileAsync(ps, ["-NoProfile", "-Command", `Remove-Item -Force '${tempWin}'`]).catch(() => {});
    } catch {
      return false;
    }
  }

  return existsSync(outputPath);
}

async function captureLinux(outputPath, opts = {}) {
  const { window: windowMode = false, area = null } = opts;

  // Prefer silent tools only — never xdg-desktop-portal / interactive pickers
  // (those pop permission dialogs, which break headless MCP use).

  if (process.env.WAYLAND_DISPLAY?.trim()) {
    if (which("grim")) {
      const args = [outputPath];
      if (area) args.unshift("-g", area);
      await execFileAsync("grim", args);
      return;
    }
    // gnome-screenshot on Wayland can flash UI; only use non-interactive -f path.
    if (which("gnome-screenshot") && !windowMode && !area) {
      await execFileAsync("gnome-screenshot", ["-f", outputPath]);
      return;
    }
  }

  if (which("scrot")) {
    const args = [outputPath];
    if (windowMode) args.push("-u");
    if (area) args.push("-a", area);
    await execFileAsync("scrot", args);
    return;
  }

  if (which("maim")) {
    const args = [outputPath];
    if (windowMode) {
      try {
        const { stdout } = await execFileAsync("xdotool", ["getactivewindow"]);
        args.push("-i", stdout.trim());
      } catch {}
    }
    if (area) {
      const [x, y, w, h] = area.split(",").map(Number);
      args.push("-g", `${w}x${h}+${x}+${y}`);
    }
    await execFileAsync("maim", args);
    return;
  }

  if (which("import")) {
    await execFileAsync("import", ["-window", "root", outputPath]);
    return;
  }

  // X11 built-ins: xwd (x11-apps) + ffmpeg convert — no ImageMagick required.
  // Same idea as macOS screencapture / Windows PowerShell: use what's already there.
  if (process.env.DISPLAY?.trim() && which("xwd")) {
    const xwdPath = outputPath.replace(/\.png$/i, ".xwd");
    await execFileAsync("xwd", ["-root", "-silent", "-out", xwdPath]);
    if (await convertXwdToPng(xwdPath, outputPath)) {
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(xwdPath);
      } catch {}
      return;
    }
    // Leave .xwd if we couldn't convert
    return xwdPath;
  }

  // Silent single-frame grab via ffmpeg x11grab (already used for video recording).
  if (process.env.DISPLAY?.trim() && (await captureViaFfmpegX11(outputPath, { area }))) {
    return;
  }

  // WSL fallback: capture the Windows host desktop.
  if (await captureViaWindowsPowershell(outputPath, { area, window: windowMode })) {
    return;
  }

  throw new Error(
    "No silent screenshot backend found. On Linux install one of: scrot, maim, grim (Wayland), " +
      "x11-apps (xwd), or ffmpeg. rudycanshoot never uses permission-prompt portals. " +
      "On WSL, powershell.exe desktop capture is used when available. " +
      "For CI/headless, use rudycanshoot capture_command instead."
  );
}

async function convertXwdToPng(xwdPath, pngPath) {
  if (which("convert")) {
    try {
      await execFileAsync("convert", [xwdPath, pngPath]);
      return existsSync(pngPath);
    } catch {}
  }
  if (which("ffmpeg") || existsSync("/usr/bin/ffmpeg")) {
    const ffmpeg = which("ffmpeg") ? "ffmpeg" : "/usr/bin/ffmpeg";
    try {
      await execFileAsync(
        ffmpeg,
        ["-y", "-i", xwdPath, "-frames:v", "1", "-update", "1", pngPath],
        { timeout: 30_000 }
      );
      return existsSync(pngPath);
    } catch {}
  }
  return false;
}

async function captureViaFfmpegX11(outputPath, opts = {}) {
  const ffmpegBin = which("ffmpeg") ? "ffmpeg" : existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : null;
  if (!ffmpegBin) return false;
  const display = process.env.DISPLAY.trim();
  const { area = null } = opts;
  const args = ["-y"];
  if (area) {
    const [x, y, w, h] = area.split(",").map(Number);
    args.push(
      "-video_size",
      `${w}x${h}`,
      "-f",
      "x11grab",
      "-i",
      `${display}+${x},${y}`,
      "-frames:v",
      "1",
      "-update",
      "1",
      outputPath
    );
  } else {
    // Probe size via xdpyinfo when available
    let size = "1920x1080";
    try {
      const { stdout } = await execFileAsync("xdpyinfo", []);
      const m = stdout.match(/dimensions:\s+(\d+x\d+)/);
      if (m) size = m[1];
    } catch {}
    args.push(
      "-video_size",
      size,
      "-f",
      "x11grab",
      "-i",
      display,
      "-frames:v",
      "1",
      "-update",
      "1",
      outputPath
    );
  }
  try {
    await execFileAsync(ffmpegBin, args, { timeout: 15_000, env: process.env });
    return existsSync(outputPath);
  } catch {
    return false;
  }
}

async function captureMac(outputPath, opts = {}) {
  const { area = null, window: windowMode = false } = opts;
  const args = [];
  if (area) {
    const [x, y, w, h] = area.split(",").map(Number);
    args.push("-R", `${x},${y},${w},${h}`);
  } else if (windowMode) {
    args.push("-w");
  }
  args.push(outputPath);
  await execFileAsync("screencapture", args);
}

async function captureWindows(outputPath) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $screen.Width,$screen.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($screen.Location,[System.Drawing.Point]::Empty,$screen.Size)
$bmp.Save('${outputPath.replace(/\\/g, "\\\\")}')
$g.Dispose(); $bmp.Dispose()
`.trim();
  await execFileAsync("powershell", ["-Command", script]);
}

export async function takeScreenshot(opts = {}) {
  const {
    outputDir = defaultOutputDir(),
    filename = timestampedName(),
    window: windowMode = false,
    area = null,
  } = opts;

  const outputPath = resolve(join(outputDir, filename));
  const os = platform();

  if (os === "linux") ensureDisplayEnv();

  if (os === "darwin") {
    await captureMac(outputPath, { window: windowMode, area });
  } else if (os === "win32") {
    await captureWindows(outputPath);
  } else {
    const actual = await captureLinux(outputPath, { window: windowMode, area });
    return actual || outputPath;
  }

  return outputPath;
}
