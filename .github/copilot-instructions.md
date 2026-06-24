# GitHub Copilot Instructions — screenshot-mcp

This project is an MCP server + CLI for taking screenshots in AI-driven workflows.

## Key patterns

- Platform-specific screenshot logic is in `src/screenshot.js` — add new backends there
- MCP tool definitions are in `src/server.js` using `@modelcontextprotocol/sdk`
- AI tool installers are in `src/install.js` — each tool gets an entry in `TOOL_INSTALLERS`
- The CLI in `bin/screenshot-mcp.js` uses `commander` — add new subcommands there

## When suggesting code

- Keep platform detection explicit (`process.platform === "linux"` etc.)
- Screenshot backends must fail gracefully with clear error messages listing alternatives
- MCP tools must return `{ content: [...] }` — never throw inside a tool handler; catch and return error text
- JSON config files are read with `readJson()` and written with `writeJson()` from `src/install.js`
