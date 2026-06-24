import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

function which(cmd) {
  try {
    require("child_process").execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const OCR_SCRIPT = `
import sys
from pathlib import Path

image_path = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 else "eng"

try:
    import pytesseract
    from PIL import Image
    img = Image.open(image_path)
    text = pytesseract.image_to_string(img, lang=lang)
    print(text)
except ImportError:
    print("[ERROR: pytesseract not installed. Run: pip install pytesseract && sudo apt install tesseract-ocr]")
    sys.exit(1)
`;

export async function ocrImage(imagePath, lang = "eng") {
  const scriptPath = join(tmpdir(), "rudycanshoot_ocr.py");
  await writeFile(scriptPath, OCR_SCRIPT);
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, imagePath, lang], {
      timeout: 30000,
    });
    return stdout.trim();
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}

export async function ocrAvailable() {
  const script = `
try:
    import pytesseract
    print("ok")
except ImportError:
    print("missing")
`;
  const scriptPath = join(tmpdir(), "rudycanshoot_ocr_check.py");
  await writeFile(scriptPath, script);
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath]);
    return stdout.trim() === "ok";
  } catch {
    return false;
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}
