import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const WATERMARK_SCRIPT = `
import sys
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

input_path = sys.argv[1]
output_path = sys.argv[2]
text = sys.argv[3]
opacity = int(sys.argv[4])
corner = sys.argv[5]

font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
try:
    font = ImageFont.truetype(font_path, 16)
except:
    font = ImageFont.load_default()

img = Image.open(input_path).convert("RGBA")
overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
pad = 8

if corner == "br":
    x, y = img.width - tw - pad * 2, img.height - th - pad * 2
elif corner == "tr":
    x, y = img.width - tw - pad * 2, pad
elif corner == "tl":
    x, y = pad, pad
else:
    x, y = pad, img.height - th - pad * 2

draw.rectangle([x - pad//2, y - pad//2, x + tw + pad//2, y + th + pad//2],
               fill=(0, 0, 0, opacity // 2))
draw.text((x, y), text, font=font, fill=(200, 200, 200, opacity))

result = Image.alpha_composite(img, overlay).convert("RGB")
result.save(output_path, "PNG")
print(output_path)
`;

export async function addWatermark(inputPath, outputPath, text, opts = {}) {
  const { opacity = 180, corner = "br" } = opts;
  const scriptPath = join(tmpdir(), "rudycanshoot_watermark.py");
  await writeFile(scriptPath, WATERMARK_SCRIPT);
  try {
    await execFileAsync("python3", [
      scriptPath, inputPath, outputPath, text, String(opacity), corner,
    ]);
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
  return outputPath;
}
