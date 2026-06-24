import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const DIFF_SCRIPT = `
import sys
from PIL import Image, ImageChops, ImageEnhance
import numpy as np

before_path = sys.argv[1]
after_path = sys.argv[2]
out_path = sys.argv[3]
mode = sys.argv[4] if len(sys.argv) > 4 else "highlight"

before = Image.open(before_path).convert("RGB")
after = Image.open(after_path).convert("RGB")

if before.size != after.size:
    after = after.resize(before.size, Image.LANCZOS)

diff = ImageChops.difference(before, after)

if mode == "highlight":
    arr = np.array(diff)
    mask = arr.sum(axis=2) > 15
    out = np.array(after.copy())
    out[mask] = [255, 60, 60]
    result = Image.fromarray(out.astype(np.uint8))
elif mode == "heatmap":
    import numpy as np
    arr = np.array(diff).astype(float)
    intensity = arr.mean(axis=2)
    intensity = (intensity / intensity.max() * 255).astype(np.uint8) if intensity.max() > 0 else intensity.astype(np.uint8)
    r = intensity
    g = (255 - intensity)
    b = np.zeros_like(intensity)
    result = Image.fromarray(np.stack([r, g, b], axis=2).astype(np.uint8))
elif mode == "side-by-side":
    w = before.width + after.width + 4
    h = max(before.height, after.height)
    result = Image.new("RGB", (w, h), (40, 40, 40))
    result.paste(before, (0, 0))
    result.paste(after, (before.width + 4, 0))
else:
    result = diff

result.save(out_path, "PNG")
print(out_path)
`;

export async function diffScreenshots(beforePath, afterPath, outputPath, mode = "highlight") {
  const scriptPath = join(__dirname, "_diff_tmp.py");
  await writeFile(scriptPath, DIFF_SCRIPT);
  await execFileAsync("python3", [scriptPath, beforePath, afterPath, outputPath, mode]);
  return outputPath;
}
