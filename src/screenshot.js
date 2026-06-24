import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";

const execFileAsync = promisify(execFile);

export function defaultOutputDir() {
  const dir = join(homedir(), ".screenshot-mcp", "captures");
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

async function captureLinux(outputPath, opts = {}) {
  const { window: windowMode = false, area = null } = opts;

  if (process.env.WAYLAND_DISPLAY) {
    if (which("grim")) {
      const args = [outputPath];
      if (area) args.unshift("-g", area);
      await execFileAsync("grim", args);
      return;
    }
    if (which("gnome-screenshot")) {
      const args = ["-f", outputPath];
      if (area) args.push("-a");
      await execFileAsync("gnome-screenshot", args);
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
      const { stdout } = await execFileAsync("xdotool", ["getactivewindow"]);
      args.push("-i", stdout.trim());
    }
    await execFileAsync("maim", args);
    return;
  }

  if (which("import")) {
    const args = windowMode
      ? ["-window", "root", outputPath]
      : ["-window", "root", outputPath];
    await execFileAsync("import", args);
    return;
  }

  if (which("xwd") && which("convert")) {
    const xwdPath = outputPath.replace(/\.png$/, ".xwd");
    await execFileAsync("xwd", ["-root", "-silent", "-out", xwdPath]);
    await execFileAsync("convert", [xwdPath, outputPath]);
    return;
  }

  if (which("xwd")) {
    const xwdPath = outputPath.replace(/\.png$/, ".xwd");
    await execFileAsync("xwd", ["-root", "-silent", "-out", xwdPath]);
    return xwdPath;
  }

  throw new Error(
    "No screenshot tool found. Install one of: scrot, maim, grim (Wayland), gnome-screenshot, or ImageMagick."
  );
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

export async function captureTerminal(outputPath, opts = {}) {
  const { scrollback = 50 } = opts;

  if (which("ttyrec") || which("script")) {
    throw new Error("Terminal capture requires a running session — use 'screenshot-mcp terminal' from inside your terminal.");
  }

  if (process.env.TERM_PROGRAM === "iTerm.app") {
    throw new Error("Use iTerm2's built-in screenshot for terminal capture on macOS.");
  }

  return takeScreenshot({ outputPath, ...opts });
}
