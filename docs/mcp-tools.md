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

## ocr_screenshot

Extract text from a screenshot using Tesseract OCR.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `path` | string | — | Image to read text from |
| `lang` | string | `eng` | Tesseract language code |

**Requires:** `pip install pytesseract` and `sudo apt install tesseract-ocr`
