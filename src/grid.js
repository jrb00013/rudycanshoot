import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const GRID_SCRIPT = `
import sys, json
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

paths = json.loads(sys.argv[1])
output = sys.argv[2]
cols = int(sys.argv[3])
cell_w = int(sys.argv[4])
cell_h = int(sys.argv[5])
labels = json.loads(sys.argv[6]) if sys.argv[6] != "null" else None

rows = (len(paths) + cols - 1) // cols
label_h = 24 if labels else 0

canvas = Image.new("RGB", (cols * cell_w, rows * (cell_h + label_h)), (20, 20, 20))
draw = ImageDraw.Draw(canvas)

try:
    from PIL import ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 11)
except:
    font = ImageFont.load_default()

for i, path in enumerate(paths):
    row = i // cols
    col = i % cols
    x = col * cell_w
    y = row * (cell_h + label_h)
    try:
        img = Image.open(path).convert("RGB")
        img.thumbnail((cell_w, cell_h), Image.LANCZOS)
        paste_x = x + (cell_w - img.width) // 2
        paste_y = y + (cell_h - img.height) // 2
        canvas.paste(img, (paste_x, paste_y))
    except Exception as e:
        draw.text((x + 4, y + 4), f"[error: {e}]", font=font, fill=(255, 60, 60))
    if labels and i < len(labels):
        label_y = y + cell_h + 4
        draw.text((x + 4, label_y), labels[i][:40], font=font, fill=(180, 180, 180))

canvas.save(output, "PNG")
print(output)
`;

export async function makeGrid(imagePaths, outputPath, opts = {}) {
  const { cols = 2, cellWidth = 640, cellHeight = 480, labels = null } = opts;

  const scriptPath = join(tmpdir(), "rudycanshoot_grid.py");
  await writeFile(scriptPath, GRID_SCRIPT);

  await execFileAsync("python3", [
    scriptPath,
    JSON.stringify(imagePaths),
    outputPath,
    String(cols),
    String(cellWidth),
    String(cellHeight),
    labels ? JSON.stringify(labels) : "null",
  ]);

  return outputPath;
}
