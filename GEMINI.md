# rudycanshoot

MCP server providing screenshot capabilities for AI assistants.

## Tools

- `take_screenshot` — capture screen, window, or region
- `read_screenshot` — view a captured image
- `list_screenshots` — browse recent captures

## Run the server

```
node bin/rudycanshoot.js serve
```

## Project structure

```
src/screenshot.js   — OS-specific capture logic
src/server.js       — MCP tool definitions
src/install.js      — AI tool auto-installer
bin/rudycanshoot.js — CLI
```
