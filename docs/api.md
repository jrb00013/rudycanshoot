# JavaScript API Reference

rudycanshoot can be used as a Node.js library:

```js
import {
  takeScreenshot,
  annotateImage,
  diffScreenshots,
  makeGrid,
  makeGif,
  ocrImage,
  cropImage,
  resizeImage,
  highlightRegions,
  redactRegions,
  getImageMetadata,
  copyImageToClipboard,
  watch,
  getHistory,
  recordCapture,
  loadConfig,
} from "rudycanshoot";
```

## takeScreenshot(opts)

```js
const path = await takeScreenshot({
  mode: "fullscreen",   // "fullscreen" | "window" | "area"
  area: "100,100,800,600",  // required for mode=area
  filename: "snap.png",
  outputDir: "/tmp/shots",
});
```

## annotateImage(inputPath, outputPath, opts)

```js
await annotateImage("/tmp/snap.png", "/tmp/snap_labeled.png", {
  text: "CT-6101 — Boson capture",
  position: "bottom",      // "top" | "bottom" | "center"
  color: "#00ff88",
  fontSize: 18,
});
```

## diffScreenshots(before, after, output, mode)

```js
await diffScreenshots("/tmp/before.png", "/tmp/after.png", "/tmp/diff.png", "highlight");
// modes: "highlight" | "heatmap" | "side-by-side"
```

## makeGrid(paths, output, opts)

```js
await makeGrid(["/tmp/a.png", "/tmp/b.png", "/tmp/c.png"], "/tmp/grid.png", {
  cols: 3,
  cellWidth: 640,
  cellHeight: 480,
  labels: ["Before", "After", "Diff"],
});
```

## makeGif(paths, output, opts)

```js
await makeGif(["/tmp/f0.png", "/tmp/f1.png", "/tmp/f2.png"], "/tmp/anim.gif", {
  duration: 500,   // ms per frame
  loop: 0,         // 0 = loop forever
  maxWidth: 800,
});
```

## watch(opts)

```js
const watcher = watch({
  intervalMs: 3000,
  mode: "fullscreen",
  limit: 10,
})
  .on("capture", ({ path, count }) => console.log(count, path))
  .on("stopped", ({ count }) => console.log("done, captured", count))
  .start();

// Stop manually:
// watcher.stop();
```

## cropImage / resizeImage

```js
await cropImage("/tmp/snap.png", "/tmp/cropped.png", 100, 200, 400, 300);
await resizeImage("/tmp/snap.png", "/tmp/small.png", 800, null); // width 800, preserve ratio
```

## highlightRegions / redactRegions

```js
await highlightRegions("/tmp/snap.png", "/tmp/highlighted.png", [
  { x: 50, y: 100, w: 200, h: 80, label: "button" },
  { x: 300, y: 200, w: 150, h: 50 },
], "#ff0000");

await redactRegions("/tmp/snap.png", "/tmp/redacted.png", [
  { x: 0, y: 0, w: 400, h: 40 },  // redact header
], { color: "#000000", style: "fill" });
// style: "fill" | "blur"
```

## getImageMetadata(path)

```js
const meta = await getImageMetadata("/tmp/snap.png");
// { width, height, mode, format, size, sizeKb, created, modified, filename, path }
```

## History

```js
import { recordCapture, getHistory, tagCapture } from "rudycanshoot";

await recordCapture("/tmp/snap.png", { tags: ["boson", "ct-6101"] });
const recent = await getHistory(20, { tag: "boson" });
await tagCapture("/tmp/snap.png", ["verified"]);
```
