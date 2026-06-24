import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const GIF_SCRIPT = `
import sys, json
from PIL import Image

paths = json.loads(sys.argv[1])
output = sys.argv[2]
duration = int(sys.argv[3])
loop = int(sys.argv[4])
max_w = int(sys.argv[5])

frames = []
for p in paths:
    try:
        img = Image.open(p).convert("RGBA")
        if img.width > max_w:
            ratio = max_w / img.width
            img = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)
        frames.append(img)
    except Exception as e:
        print(f"skip {p}: {e}", file=__import__('sys').stderr)

if not frames:
    print("no frames", file=__import__('sys').stderr)
    sys.exit(1)

frames[0].save(
    output,
    format="GIF",
    save_all=True,
    append_images=frames[1:],
    duration=duration,
    loop=loop,
    optimize=True,
)
print(output)
`;

export async function makeGif(imagePaths, outputPath, opts = {}) {
  const { duration = 500, loop = 0, maxWidth = 800 } = opts;
  const scriptPath = join(tmpdir(), "rudycanshoot_gif.py");
  await writeFile(scriptPath, GIF_SCRIPT);
  try {
    await execFileAsync("python3", [
      scriptPath,
      JSON.stringify(imagePaths),
      outputPath,
      String(duration),
      String(loop),
      String(maxWidth),
    ]);
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
  return outputPath;
}
