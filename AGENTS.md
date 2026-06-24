# screenshot-mcp — Agent Instructions

## Project Overview

screenshot-mcp is an MCP server and CLI tool that enables AI assistants to capture and view screenshots across Linux, macOS, and Windows.

## MCP Server

Start with: `node bin/screenshot-mcp.js serve`

Tools exposed:
- `take_screenshot(mode, area?, filename?, outputDir?)` → file path
- `read_screenshot(path)` → base64 image
- `list_screenshots(limit?)` → list of recent captures

## Coding Conventions

- ES modules (`type: "module"` in package.json), use `import`/`export`
- Node.js built-in APIs preferred over third-party where possible
- Platform detection via `process.platform` (`linux`, `darwin`, `win32`)
- Screenshot backends tried in order: prefer native/installed tools, fall back gracefully
- No TypeScript — plain JavaScript with JSDoc if types need documenting

## Testing

```bash
node bin/screenshot-mcp.js capture --mode fullscreen
node bin/screenshot-mcp.js list
```

## Adding a New AI Tool Installer

Edit `src/install.js`, add an entry to `TOOL_INSTALLERS`:

```js
"my-tool": () => {
  const configPath = join(HOME, ".my-tool", "mcp.json");
  const config = readJson(configPath);
  config.mcpServers = config.mcpServers || {};
  config.mcpServers["screenshot-mcp"] = MCP_ENTRY;
  writeJson(configPath, config);
},
```
