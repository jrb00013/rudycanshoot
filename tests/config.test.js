import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, DEFAULTS } from "../src/config.js";

test("loadConfig returns defaults when no config file exists", async () => {
  const config = await loadConfig();
  assert.equal(typeof config.outputDir, "string");
  assert.equal(typeof config.defaultMode, "string");
  assert.equal(typeof config.fontSize, "number");
  assert.ok(["fullscreen", "window", "area"].includes(config.defaultMode));
});

test("DEFAULTS has all required keys", () => {
  const required = ["outputDir", "defaultMode", "fontSize", "theme", "historyLimit", "watchInterval"];
  for (const key of required) {
    assert.ok(key in DEFAULTS, `DEFAULTS missing key: ${key}`);
  }
});
