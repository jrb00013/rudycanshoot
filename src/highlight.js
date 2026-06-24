import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const HIGHLIGHT_SCRIPT = `
import sys, json
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

input_path = sys.argv[1]
output_path = sys.argv[2]
regions = json.loads(sys.argv[3])
color_hex = sys.argv[4]

r = int(color_hex[1:3], 16)
g = int(color_hex[3:5], 16)
b = int(color_hex[5:7], 16)

img = Image.open(input_path).convert("RGBA")
overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

for region in regions:
    x, y, w, h = region['x'], region['y'], region['w'], region['h']
    draw.rectangle([x, y, x + w, y + h], fill=(r, g, b, 80))
    draw.rectangle([x, y, x + w, y + h], outline=(r, g, b, 200), width=3)

    if region.get('label'):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 14)
        except:
            font = ImageFont.load_default()
        draw.text((x + 4, y + 4), region['label'], font=font, fill=(r, g, b, 255))

result = Image.alpha_composite(img, overlay).convert("RGB")
result.save(output_path, "PNG")
print(output_path)
`;

export async function highlightRegions(inputPath, outputPath, regions, color = "#ffff00") {
  const scriptPath = join(tmpdir(), "rudycanshoot_highlight.py");
  await writeFile(scriptPath, HIGHLIGHT_SCRIPT);
  try {
    await execFileAsync("python3", [
      scriptPath,
      inputPath,
      outputPath,
      JSON.stringify(regions),
      color,
    ]);
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
  return outputPath;
}
