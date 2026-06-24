import { test } from "node:test";
import assert from "node:assert/strict";
import { getTheme, THEME_NAMES, THEMES } from "../src/themes.js";

test("getTheme returns dark theme by default", () => {
  const t = getTheme();
  assert.ok(Array.isArray(t.bg));
  assert.equal(t.bg.length, 3);
});

test("getTheme returns correct theme by name", () => {
  for (const name of THEME_NAMES) {
    const t = getTheme(name);
    assert.ok(t, `theme ${name} should exist`);
    assert.ok(Array.isArray(t.bg), `theme ${name} should have bg color`);
    assert.ok(Array.isArray(t.text), `theme ${name} should have text color`);
  }
});

test("getTheme falls back to dark for unknown name", () => {
  const t = getTheme("nonexistent-theme-xyz");
  assert.deepEqual(t, THEMES.dark);
});

test("all themes have required color keys", () => {
  const required = ["bg", "bar", "bar_text", "prompt", "text", "error", "dot_red", "dot_green"];
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const key of required) {
      assert.ok(key in theme, `theme ${name} missing key: ${key}`);
    }
  }
});
