import { test } from "node:test";
import assert from "node:assert/strict";
import { AVAILABLE_TOOLS } from "../src/install.js";

test("AVAILABLE_TOOLS lists all expected tools", () => {
  const expected = [
    "claude-code", "cursor", "windsurf", "codex",
    "gemini", "opencode", "continue", "cline", "aider", "github-copilot",
  ];
  for (const tool of expected) {
    assert.ok(
      AVAILABLE_TOOLS.includes(tool),
      `AVAILABLE_TOOLS should include ${tool}`
    );
  }
});

test("AVAILABLE_TOOLS has no duplicates", () => {
  const unique = new Set(AVAILABLE_TOOLS);
  assert.equal(unique.size, AVAILABLE_TOOLS.length, "should have no duplicate tool names");
});
