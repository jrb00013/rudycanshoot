import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getImageMetadata } from "../src/metadata.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const renderScript = join(__dirname, "../src/terminal_render.py");

test("getImageMetadata returns correct dimensions", async () => {
  const outPath = join(tmpdir(), "rudycanshoot_meta_test.png");
  await execFileAsync("python3", [
    renderScript,
    "--cmd", "echo metadata test",
    "--output", outPath,
  ]);
  assert.ok(existsSync(outPath));

  const meta = await getImageMetadata(outPath);
  assert.ok(typeof meta.width === "number" && meta.width > 0);
  assert.ok(typeof meta.height === "number" && meta.height > 0);
  assert.equal(meta.format, "PNG");
  assert.ok(meta.sizeKb > 0);
  assert.ok(meta.filename.endsWith(".png"));

  unlinkSync(outPath);
});
