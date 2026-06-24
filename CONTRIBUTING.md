# Contributing to rudycanshoot

## Getting started

```bash
git clone https://github.com/jrb00013/rudycanshoot
cd rudycanshoot
npm install
pip3 install pillow   # required for terminal capture and image processing
```

## Running tests

```bash
npm test
```

Tests use Node's built-in `node:test` runner — no extra test framework needed.

On headless systems (CI, SSH), X11 screenshot tests are skipped automatically.
Terminal capture tests (`capture_command`) work without a display.

## Adding a screenshot backend

Edit `src/screenshot.js`. Backends are tried in order — add yours before the `xwd` fallback:

```js
if (which("my-tool")) {
  await execFileAsync("my-tool", [outputPath]);
  return;
}
```

## Adding an AI tool installer

Edit `src/install.js`. Add a key to `TOOL_INSTALLERS`:

```js
"my-tool": () => {
  const configPath = join(HOME, ".my-tool", "mcp.json");
  const config = readJson(configPath);
  config.mcpServers = config.mcpServers || {};
  config.mcpServers["rudycanshoot"] = MCP_ENTRY;
  writeJson(configPath, config);
},
```

Then add a case to the `install` command in `bin/rudycanshoot.js`.

## Adding an MCP tool

Edit `src/server.js`. Use `server.tool()`:

```js
server.tool(
  "my_tool_name",
  "Description of what it does.",
  { param: z.string().describe("what it is") },
  async ({ param }) => {
    // do work
    return { content: [{ type: "text", text: result }] };
  }
);
```

## Code style

- ES modules throughout (`import`/`export`)
- No TypeScript — plain JS
- Prefer Node.js built-ins over third-party packages
- Python scripts for image processing (Pillow is the only Python dep)
- No inline comments unless the behavior is non-obvious

## Pull requests

- One feature or fix per PR
- Include a test if you're adding new functionality
- Update `docs/mcp-tools.md` if you add a new MCP tool
