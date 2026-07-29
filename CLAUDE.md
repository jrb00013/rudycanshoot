# rudycanshoot

This is the rudycanshoot project — an MCP server that lets AI assistants take and view screenshots.

## MCP Tools Available

| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture fullscreen, active window, or a region |
| `read_screenshot` | Read a saved screenshot as base64 for viewing |
| `list_screenshots` | List recent captures with timestamps and paths |
| `record_video` | Record a temporary screen video; returns frames for AI viewing |
| `read_video` | Extract frames from a video so the AI can watch it |

## Development Commands

```bash
npm install          # install dependencies
node bin/rudycanshoot.js serve    # start MCP server (stdio)
node bin/rudycanshoot.js capture  # take a screenshot from CLI
node bin/rudycanshoot.js install --all  # configure all AI tools
```

## Key Files

- `src/screenshot.js` — platform-specific capture logic (Linux/macOS/Windows)
- `src/server.js` — MCP server with tool definitions
- `src/install.js` — auto-installer for AI tools
- `bin/rudycanshoot.js` — CLI entry point

## Screenshot Backends (Linux, in priority order)

Silent tools only (no portal permission popups):

1. `grim` (Wayland)
2. `scrot` / `maim` / `import` (X11)
3. `xwd` + `ffmpeg` → PNG (X11 built-in path)
4. `ffmpeg` x11grab single frame
5. WSL → Windows PowerShell (fallback)

Install optional: `sudo apt install scrot` or `sudo apt install grim` (Wayland). `xwd` + `ffmpeg` often already enough on X11.
