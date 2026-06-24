import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const STITCH_SCRIPT = `
import sys, json
from PIL import Image

paths = json.loads(sys.argv[1])
output = sys.argv[2]
direction = sys.argv[3]
gap = int(sys.argv[4])
bg = tuple(int(x) for x in sys.argv[5].split(','))

images = [Image.open(p).convert("RGB") for p in paths]

if direction == "vertical":
    total_w = max(img.width for img in images)
    total_h = sum(img.height for img in images) + gap * (len(images) - 1)
    canvas = Image.new("RGB", (total_w, total_h), bg)
    y = 0
    for img in images:
        canvas.paste(img, ((total_w - img.width) // 2, y))
        y += img.height + gap
else:
    total_w = sum(img.width for img in images) + gap * (len(images) - 1)
    total_h = max(img.height for img in images)
    canvas = Image.new("RGB", (total_w, total_h), bg)
    x = 0
    for img in images:
        canvas.paste(img, (x, (total_h - img.height) // 2))
        x += img.width + gap

canvas.save(output, "PNG")
print(output)
`;

export async function stitchImages(imagePaths, outputPath, opts = {}) {
  const { direction = "vertical", gap = 8, background = [20, 20, 20] } = opts;
  const scriptPath = join(tmpdir(), "rudycanshoot_stitch.py");
  await writeFile(scriptPath, STITCH_SCRIPT);
  try {
    await execFileAsync("python3", [
      scriptPath,
      JSON.stringify(imagePaths),
      outputPath,
      direction,
      String(gap),
      background.join(","),
    ]);
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
  return outputPath;
}
