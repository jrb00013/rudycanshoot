import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const META_SCRIPT = `
import sys, json
from PIL import Image

path = sys.argv[1]
img = Image.open(path)
info = {
    "width": img.width,
    "height": img.height,
    "mode": img.mode,
    "format": img.format,
    "info": {k: str(v) for k, v in (img.info or {}).items() if isinstance(v, (str, int, float))},
}
print(json.dumps(info))
`;

export async function getImageMetadata(imagePath) {
  const scriptPath = join(tmpdir(), "rudycanshoot_meta.py");
  await writeFile(scriptPath, META_SCRIPT);
  try {
    const [{ stdout }, fileStat] = await Promise.all([
      execFileAsync("python3", [scriptPath, imagePath]),
      stat(imagePath),
    ]);
    const imageInfo = JSON.parse(stdout.trim());
    return {
      path: imagePath,
      filename: basename(imagePath),
      size: fileStat.size,
      sizeKb: Math.round(fileStat.size / 1024 * 10) / 10,
      created: fileStat.birthtime.toISOString(),
      modified: fileStat.mtime.toISOString(),
      ...imageInfo,
    };
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}
