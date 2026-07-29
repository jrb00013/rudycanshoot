import { test } from "node:test";
import assert from "node:assert/strict";
import { platform } from "node:os";
import { ensureDisplayEnv } from "../src/display.js";

test("ensureDisplayEnv finds a display when DISPLAY is cleared", async (t) => {
  if (platform() !== "linux") {
    t.skip("Linux only");
    return;
  }
  const prev = process.env.DISPLAY;
  const prevWayland = process.env.WAYLAND_DISPLAY;
  delete process.env.DISPLAY;
  delete process.env.WAYLAND_DISPLAY;

  const result = ensureDisplayEnv();
  assert.ok(
    result.display || result.wayland,
    `expected a display, got ${JSON.stringify(result)}`
  );
  if (result.display) {
    assert.equal(process.env.DISPLAY, result.display);
    assert.match(process.env.DISPLAY, /^:\d+/);
  }

  if (prev !== undefined) process.env.DISPLAY = prev;
  else delete process.env.DISPLAY;
  if (prevWayland !== undefined) process.env.WAYLAND_DISPLAY = prevWayland;
  else delete process.env.WAYLAND_DISPLAY;
});

test("ensureDisplayEnv keeps an existing DISPLAY", () => {
  if (platform() !== "linux") return;
  process.env.DISPLAY = ":99-test-keep";
  const result = ensureDisplayEnv();
  assert.equal(result.display, ":99-test-keep");
  delete process.env.DISPLAY;
});
