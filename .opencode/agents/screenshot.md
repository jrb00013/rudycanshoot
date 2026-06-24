---
name: Screenshot
description: Take and view screenshots using the screenshot-mcp MCP server
---

Use the screenshot-mcp MCP server tools when asked to capture or view the screen:

- `take_screenshot` — capture fullscreen, window, or area
- `read_screenshot` — load a saved image for viewing
- `list_screenshots` — browse recent captures

After taking a screenshot, always call `read_screenshot` with the returned path
to load and describe the image contents.
