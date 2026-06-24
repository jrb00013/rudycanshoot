import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

export async function annotateImage(inputPath, outputPath, opts = {}) {
  const {
    text = "",
    position = "bottom",
    color = "#00ff88",
    fontSize = 18,
    padding = 8,
  } = opts;

  const script = `
import sys
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

input_path = sys.argv[1]
output_path = sys.argv[2]
text = sys.argv[3]
position = sys.argv[4]
color = sys.argv[5]
font_size = int(sys.argv[6])
pad = int(sys.argv[7])

font_candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
]
font = None
for fc in font_candidates:
    if Path(fc).exists():
        try:
            from PIL import ImageFont
            font = ImageFont.truetype(fc, font_size)
            break
        except: pass
if font is None:
    from PIL import ImageFont
    font = ImageFont.load_default()

img = Image.open(input_path).convert("RGB")
draw = ImageDraw.Draw(img)

bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

if position == "bottom":
    x = pad
    y = img.height - th - pad * 2
elif position == "top":
    x = pad
    y = pad
elif position == "center":
    x = (img.width - tw) // 2
    y = (img.height - th) // 2
else:
    x = pad
    y = img.height - th - pad * 2

draw.rectangle([x - pad, y - pad, x + tw + pad, y + th + pad], fill=(0, 0, 0, 180))
draw.text((x, y), text, font=font, fill=color)

img.save(output_path, "PNG")
print(output_path)
`;

  const scriptPath = join(__dirname, "_annotate_tmp.py");
  await writeFile(scriptPath, script);

  const out = outputPath || inputPath.replace(/\.png$/, "_annotated.png");
  await execFileAsync("python3", [
    scriptPath,
    inputPath,
    out,
    text,
    position,
    color,
    String(fontSize),
    String(padding),
  ]);

  return out;
}
