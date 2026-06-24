# Recipes

Common patterns for using rudycanshoot with AI assistants.

---

## Screenshot + OCR + respond

Ask Claude Code: *"Take a screenshot, read the text, and summarize what's on screen."*

Claude will:
1. `take_screenshot` → get path
2. `read_screenshot` → view the image
3. `ocr_screenshot` → extract any text
4. Synthesize and explain

---

## Capture terminal output as evidence

```
/screenshot-cmd "npm test 2>&1"
```

Or directly via MCP:
```json
{ "tool": "capture_command", "arguments": { "command": "npm test", "title": "test run" } }
```

---

## Before/after workflow

```
Capture before.png
[make a change]
Capture after.png
diff_screenshots(before.png, after.png, diff.png, "highlight")
```

Useful for: CSS changes, layout shifts, UI regressions.

---

## Watch for changes

```js
import { watch } from "rudycanshoot";

watch({ intervalMs: 2000, limit: 30 })
  .on("capture", ({ path }) => console.log("captured:", path))
  .start();
```

---

## Redact before sharing

```js
await redactRegions("snap.png", "safe.png", [
  { x: 0, y: 0, w: 1920, h: 32 },    // title bar (might have username)
  { x: 800, y: 600, w: 300, h: 40 }, // password field
], { style: "blur" });
```

---

## Bulk terminal capture for a report

```bash
for cmd in "git log --oneline -10" "npm test" "df -h" "ps aux | head -20"; do
  rudycanshoot capture-command "$cmd" --output "report_$(date +%s).png"
done
```

---

## Animated GIF of a process

```js
import { watch, makeGif } from "rudycanshoot";

const frames = [];
const watcher = watch({ intervalMs: 1000, limit: 15 })
  .on("capture", ({ path }) => frames.push(path))
  .on("stopped", async () => {
    await makeGif(frames, "demo.gif", { duration: 800 });
    console.log("demo.gif ready");
  })
  .start();
```

---

## Grid summary of all captures today

```js
import { getHistory, makeGrid } from "rudycanshoot";

const today = new Date().toISOString().slice(0, 10);
const entries = await getHistory(50, { since: today });
const paths = entries.map((e) => e.path);
await makeGrid(paths, "today_summary.png", { cols: 4, cellWidth: 480, cellHeight: 360 });
```
