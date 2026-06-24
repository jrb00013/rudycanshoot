# rudycanshoot

This is the rudycanshoot project — an MCP server that lets AI assistants take and view screenshots.

## MCP Tools Available

| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture fullscreen, active window, or a region |
| `read_screenshot` | Read a saved screenshot as base64 for viewing |
| `list_screenshots` | List recent captures with timestamps and paths |

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

1. `grim` (Wayland)
2. `scrot` (X11)
3. `maim` (X11)
4. `import` (ImageMagick, X11)
5. `xwd` + `convert` (X11, fallback)

Install one: `sudo apt install scrot` or `sudo apt install grim` (Wayland)
