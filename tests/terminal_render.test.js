import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const renderScript = join(__dirname, "../src/terminal_render.py");
const OUT = join(tmpdir(), "rudycanshoot_test_render.png");

test("terminal_render.py produces a PNG file", async () => {
  const { stdout } = await execFileAsync("python3", [
    renderScript,
    "--cmd", "echo hello rudycanshoot",
    "--title", "test render",
    "--output", OUT,
  ]);
  assert.equal(stdout.trim(), OUT, "stdout should be the output path");
  assert.ok(existsSync(OUT), "output PNG should exist");
  unlinkSync(OUT);
});

test("terminal_render.py handles commands with multiline output", async () => {
  const out2 = join(tmpdir(), "rudycanshoot_test_multi.png");
  await execFileAsync("python3", [
    renderScript,
    "--cmd", "printf 'line1\\nline2\\nline3\\n'",
    "--output", out2,
  ]);
  assert.ok(existsSync(out2), "multiline output PNG should exist");
  unlinkSync(out2);
});

test("terminal_render.py handles failing commands gracefully", async () => {
  const out3 = join(tmpdir(), "rudycanshoot_test_fail.png");
  await execFileAsync("python3", [
    renderScript,
    "--cmd", "exit 42",
    "--title", "failing command",
    "--output", out3,
  ]);
  assert.ok(existsSync(out3), "error output PNG should exist");
  unlinkSync(out3);
});
