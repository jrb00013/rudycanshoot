# MCP Tools Reference

This document describes all tools exposed by the rudycanshoot MCP server.

## take_screenshot

Capture a screenshot and save it to disk.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `fullscreen\|window\|area` | `fullscreen` | What to capture |
| `area` | string | — | `x,y,width,height` — required when mode=area |
| `filename` | string | auto | Output filename |
| `outputDir` | string | `~/.rudycanshoot/captures/` | Where to save |

**Returns:** File path + resource URI

---

## read_screenshot

Load a saved screenshot as base64 so the AI can view its contents.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `path` | string | Absolute path to the PNG/JPEG file |

**Returns:** Base64-encoded image

---

## list_screenshots

Browse recent captures.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | int | 20 | Max number of results |

**Returns:** Timestamped list of paths and file sizes

---

## capture_command

Run a shell command and render its output as a styled terminal screenshot PNG. Works headless — no display required.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `command` | string | — | Shell command to run |
| `title` | string | command text | Title bar label |
| `outputDir` | string | auto | Where to save |
| `filename` | string | auto | Output filename |
| `timeout` | int | 30 | Seconds before killing the command |
| `fontSize` | int | 13 | Font size for the rendered image |

**Returns:** File path of the rendered PNG

---

## annotate_screenshot

Add a text label to an existing screenshot.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `path` | string | — | Input image path |
| `text` | string | — | Text to add |
| `outputPath` | string | auto | Where to write annotated image |
| `position` | `top\|bottom\|center` | `bottom` | Where to place the label |
| `color` | string | `#00ff88` | Text color (hex) |

---

## diff_screenshots

Compare two screenshots and render a difference image.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `before` | string | — | Path to "before" image |
| `after` | string | — | Path to "after" image |
| `outputPath` | string | — | Where to save the diff |
| `mode` | `highlight\|heatmap\|side-by-side` | `highlight` | Diff visualization style |

---

## record_video

Record a temporary screen video for visual monitoring. By default extracts evenly spaced frames and returns them as images so the AI can watch what happened.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `durationSec` | number | `5` | Recording length (seconds) |
| `fps` | int | `4` | Capture rate for frame-sampling backend |
| `area` | string | — | Optional `x,y,width,height` region |
| `temporary` | bool | `true` | Store under `~/.rudycanshoot/videos/tmp/` |
| `returnFrames` | bool | `true` | Include frames as viewable images |
| `maxFrames` | int | `12` | Max frames returned to the model |

**Returns:** Video path + image frames (when `returnFrames=true`)

**Backends (priority):** `wf-recorder` (Wayland) → `ffmpeg` screen grab → screenshot frame sampling → GIF fallback

**Requires:** A screenshot tool (`grim`/`scrot`/…) and/or `ffmpeg` (auto-downloads a static Linux binary to `~/.rudycanshoot/bin/` when needed). Optional: `npm i ffmpeg-static`.

---

## read_video

Extract frames from a saved video/GIF so the AI can visually review it.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `path` | string | — | Absolute path to video/GIF |
| `maxFrames` | int | `12` | Max evenly spaced frames |

**Returns:** Base64 PNG frames

---

## list_videos

List recent recordings (including temporary ones).

---

## cleanup_videos

Delete temporary recordings (default) or all recordings.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `all` | bool | `false` | Delete kept videos too |
| `olderThanMinutes` | number | `0` | Only delete older than N minutes |

---

## ocr_screenshot

Extract text from a screenshot using Tesseract OCR.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `path` | string | — | Image to read text from |
| `lang` | string | `eng` | Tesseract language code |

**Requires:** `pip install pytesseract` and `sudo apt install tesseract-ocr`
