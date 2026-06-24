import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const BORDER_SCRIPT = `
import sys
from PIL import Image, ImageOps

input_path = sys.argv[1]
output_path = sys.argv[2]
width = int(sys.argv[3])
color = tuple(int(sys.argv[4][i:i+2], 16) for i in (1, 3, 5))
radius = int(sys.argv[5])

img = Image.open(input_path).convert("RGB")

if radius > 0:
    import numpy as np
    from PIL import ImageDraw
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=radius, fill=255)
    bordered = ImageOps.expand(img, border=width, fill=color)
    bordered.save(output_path, "PNG")
else:
    bordered = ImageOps.expand(img, border=width, fill=color)
    bordered.save(output_path, "PNG")

print(output_path)
`;

export async function addBorder(inputPath, outputPath, opts = {}) {
  const { width = 4, color = "#444444", radius = 0 } = opts;
  const scriptPath = join(tmpdir(), "rudycanshoot_border.py");
  await writeFile(scriptPath, BORDER_SCRIPT);
  try {
    await execFileAsync("python3", [
      scriptPath, inputPath, outputPath, String(width), color, String(radius),
    ]);
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
  return outputPath;
}
