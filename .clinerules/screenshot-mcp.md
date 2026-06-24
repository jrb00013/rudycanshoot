# screenshot-mcp (Cline rules)

MCP server for AI screenshot capture. Project structure:

- `src/screenshot.js` — OS screenshot logic
- `src/server.js` — MCP tools (`take_screenshot`, `read_screenshot`, `list_screenshots`)
- `src/install.js` — auto-installer for Claude Code, Cursor, Windsurf, Codex, Gemini, etc.
- `bin/screenshot-mcp.js` — CLI (`capture`, `serve`, `install`, `list`)

Run MCP server: `node bin/screenshot-mcp.js serve`

To add a new AI tool installer, add an entry to `TOOL_INSTALLERS` in `src/install.js`.
