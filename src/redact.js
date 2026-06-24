import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const REDACT_SCRIPT = `
import sys, json
from PIL import Image, ImageDraw

input_path = sys.argv[1]
output_path = sys.argv[2]
regions = json.loads(sys.argv[3])
color = tuple(int(sys.argv[4].lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
style = sys.argv[5]

img = Image.open(input_path).convert("RGB")
draw = ImageDraw.Draw(img)

for r in regions:
    x, y, w, h = r['x'], r['y'], r['w'], r['h']
    if style == 'blur':
        region = img.crop((x, y, x + w, y + h))
        small = region.resize((max(1, w // 8), max(1, h // 8)))
        blurred = small.resize((w, h), 0)  # NEAREST
        img.paste(blurred, (x, y))
    else:
        draw.rectangle([x, y, x + w, y + h], fill=color)

img.save(output_path, "PNG")
print(output_path)
`;

export async function redactRegions(inputPath, outputPath, regions, opts = {}) {
  const { color = "#000000", style = "fill" } = opts;
  const scriptPath = join(tmpdir(), "rudycanshoot_redact.py");
  await writeFile(scriptPath, REDACT_SCRIPT);
  try {
    await execFileAsync("python3", [
      scriptPath,
      inputPath,
      outputPath,
      JSON.stringify(regions),
      color,
      style,
    ]);
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
  return outputPath;
}
