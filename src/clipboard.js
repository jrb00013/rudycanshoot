import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { platform } from "node:os";

const execFileAsync = promisify(execFile);

function whichSync(cmd) {
  try {
    require("child_process").execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function copyImageToClipboard(imagePath) {
  const os = platform();

  if (os === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      `set the clipboard to (read (POSIX file "${imagePath}") as JPEG picture)`,
    ]);
    return;
  }

  if (os === "win32") {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${imagePath.replace(/\\/g, "\\\\")}'))
`;
    await execFileAsync("powershell", ["-Command", ps]);
    return;
  }

  if (process.env.WAYLAND_DISPLAY) {
    const data = await readFile(imagePath);
    const proc = require("child_process").spawn("wl-copy", ["--type", "image/png"]);
    proc.stdin.write(data);
    proc.stdin.end();
    await new Promise((res, rej) => proc.on("close", (code) => (code === 0 ? res() : rej(new Error(`wl-copy exit ${code}`)))));
    return;
  }

  const data = await readFile(imagePath);
  const proc = require("child_process").spawn("xclip", ["-selection", "clipboard", "-t", "image/png"]);
  proc.stdin.write(data);
  proc.stdin.end();
  await new Promise((res, rej) => proc.on("close", (code) => (code === 0 ? res() : rej(new Error(`xclip exit ${code}`)))));
}
