import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const COMPARE_SCRIPT = `
import sys, json
from PIL import Image
import numpy as np

before_path = sys.argv[1]
after_path = sys.argv[2]

before = Image.open(before_path).convert("RGB")
after = Image.open(after_path).convert("RGB")

if before.size != after.size:
    after = after.resize(before.size, Image.LANCZOS)

b = np.array(before, dtype=float)
a = np.array(after, dtype=float)
diff = np.abs(b - a)
changed_pixels = (diff.sum(axis=2) > 10).sum()
total_pixels = b.shape[0] * b.shape[1]
pct = changed_pixels / total_pixels * 100

result = {
    "changed_pixels": int(changed_pixels),
    "total_pixels": int(total_pixels),
    "change_percent": round(float(pct), 2),
    "mean_diff": round(float(diff.mean()), 2),
    "max_diff": round(float(diff.max()), 2),
    "is_identical": bool(changed_pixels == 0),
}
print(json.dumps(result))
`;

export async function compareScreenshots(beforePath, afterPath) {
  const scriptPath = join(tmpdir(), "rudycanshoot_compare.py");
  await writeFile(scriptPath, COMPARE_SCRIPT);
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, beforePath, afterPath]);
    return JSON.parse(stdout.trim());
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}
