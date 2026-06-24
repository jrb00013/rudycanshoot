import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const CROP_SCRIPT = `
import sys
from PIL import Image

input_path = sys.argv[1]
output_path = sys.argv[2]
x, y, w, h = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])

img = Image.open(input_path)
cropped = img.crop((x, y, x + w, y + h))
cropped.save(output_path, "PNG")
print(output_path)
`;

const RESIZE_SCRIPT = `
import sys
from PIL import Image

input_path = sys.argv[1]
output_path = sys.argv[2]
w = int(sys.argv[3]) if sys.argv[3] != "null" else None
h = int(sys.argv[4]) if sys.argv[4] != "null" else None

img = Image.open(input_path)
if w and h:
    img = img.resize((w, h), Image.LANCZOS)
elif w:
    ratio = w / img.width
    img = img.resize((w, int(img.height * ratio)), Image.LANCZOS)
elif h:
    ratio = h / img.height
    img = img.resize((int(img.width * ratio), h), Image.LANCZOS)
img.save(output_path, "PNG")
print(output_path)
`;

export async function cropImage(inputPath, outputPath, x, y, width, height) {
  const scriptPath = join(tmpdir(), "rudycanshoot_crop.py");
  await writeFile(scriptPath, CROP_SCRIPT);
  await execFileAsync("python3", [scriptPath, inputPath, outputPath, x, y, width, height].map(String));
  return outputPath;
}

export async function resizeImage(inputPath, outputPath, width = null, height = null) {
  const scriptPath = join(tmpdir(), "rudycanshoot_resize.py");
  await writeFile(scriptPath, RESIZE_SCRIPT);
  await execFileAsync("python3", [
    scriptPath,
    inputPath,
    outputPath,
    width ? String(width) : "null",
    height ? String(height) : "null",
  ]);
  return outputPath;
}
