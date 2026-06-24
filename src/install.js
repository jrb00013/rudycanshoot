import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const HOME = homedir();

function resolveServerCmd() {
  try {
    const npmBin = execSync("npm root -g", { encoding: "utf8" }).trim();
    const pkg = join(dirname(npmBin), "bin", "screenshot-mcp");
    if (existsSync(pkg)) return { command: pkg, args: ["serve"] };
  } catch {}
  return { command: "npx", args: ["screenshot-mcp", "serve"] };
}

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ✓ ${path}`);
}

function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`  ✓ ${path}`);
}

function appendUnique(path, content, marker) {
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8");
    if (existing.includes(marker)) {
      console.log(`  ~ ${path} (already configured)`);
      return;
    }
    writeFileSync(path, existing.trimEnd() + "\n\n" + content + "\n");
  } else {
    writeText(path, content + "\n");
  }
  console.log(`  ✓ ${path}`);
}

const { command, args } = resolveServerCmd();

const MCP_ENTRY = { command, args };

const TOOL_INSTALLERS = {
  "claude-code": () => {
    const settingsPath = join(HOME, ".claude", "settings.json");
    const settings = readJson(settingsPath);
    settings.mcpServers = settings.mcpServers || {};
    settings.mcpServers["screenshot-mcp"] = MCP_ENTRY;
    writeJson(settingsPath, settings);

    const cmdDir = join(HOME, ".claude", "commands");
    mkdirSync(cmdDir, { recursive: true });
    const cmdPath = join(cmdDir, "screenshot.md");
    if (!existsSync(cmdPath)) {
      writeText(
        cmdPath,
        `# screenshot

Take a screenshot and show it to Claude.

## Usage
\`/screenshot\` — capture fullscreen
\`/screenshot window\` — capture active window
\`/screenshot area x,y,w,h\` — capture region

## Steps
1. Call \`mcp__screenshot-mcp__take_screenshot\` with the appropriate mode
2. Call \`mcp__screenshot-mcp__read_screenshot\` with the returned path
3. Describe what you see in the screenshot
`
      );
    }
  },

  cursor: () => {
    const configPath = join(HOME, ".cursor", "mcp.json");
    const config = readJson(configPath);
    config.mcpServers = config.mcpServers || {};
    config.mcpServers["screenshot-mcp"] = MCP_ENTRY;
    writeJson(configPath, config);
  },

  windsurf: () => {
    const configPath = join(HOME, ".codeium", "windsurf", "mcp_config.json");
    const config = readJson(configPath);
    config.mcpServers = config.mcpServers || {};
    config.mcpServers["screenshot-mcp"] = MCP_ENTRY;
    writeJson(configPath, config);
  },

  codex: () => {
    const agentsPath = join(HOME, "AGENTS.md");
    appendUnique(
      agentsPath,
      `## screenshot-mcp

MCP server available: \`screenshot-mcp\`
- \`take_screenshot\` — capture screen/window/area, returns file path
- \`read_screenshot\` — read a screenshot as base64 image
- \`list_screenshots\` — list recent captures

Use these tools whenever asked to take a screenshot or inspect the screen.`,
      "screenshot-mcp"
    );
  },

  gemini: () => {
    const settingsPath = join(HOME, ".gemini", "settings.json");
    const settings = readJson(settingsPath);
    settings.mcpServers = settings.mcpServers || {};
    settings.mcpServers["screenshot-mcp"] = MCP_ENTRY;
    writeJson(settingsPath, settings);
  },

  opencode: () => {
    const configPath = join(HOME, ".config", "opencode", "opencode.json");
    const config = readJson(configPath);
    config.mcp = config.mcp || {};
    config.mcp.servers = config.mcp.servers || {};
    config.mcp.servers["screenshot-mcp"] = MCP_ENTRY;
    writeJson(configPath, config);

    const agentDir = join(HOME, ".config", "opencode", "agents");
    mkdirSync(agentDir, { recursive: true });
    const agentPath = join(agentDir, "screenshot.md");
    if (!existsSync(agentPath)) {
      writeText(
        agentPath,
        `---
name: Screenshot
description: Take and view screenshots
---

Use the screenshot-mcp MCP server to capture screens.
Tools: take_screenshot, read_screenshot, list_screenshots
`
      );
    }
  },

  continue: () => {
    const configPath = join(HOME, ".continue", "config.json");
    const config = readJson(configPath);
    config.mcpServers = config.mcpServers || [];
    if (!config.mcpServers.find((s) => s.name === "screenshot-mcp")) {
      config.mcpServers.push({ name: "screenshot-mcp", ...MCP_ENTRY });
      writeJson(configPath, config);
    } else {
      console.log(`  ~ ${configPath} (already configured)`);
    }
  },

  cline: () => {
    const rulesDir = join(HOME, ".clinerules");
    mkdirSync(rulesDir, { recursive: true });
    const rulePath = join(rulesDir, "screenshot-mcp.md");
    if (!existsSync(rulePath)) {
      writeText(
        rulePath,
        `# screenshot-mcp

MCP server: screenshot-mcp
Available tools: take_screenshot, read_screenshot, list_screenshots

When the user asks to take a screenshot, inspect the screen, or show what's on screen,
use the screenshot-mcp tools to capture and read the image.
`
      );
    } else {
      console.log(`  ~ ${rulePath} (already configured)`);
    }
    console.log("  ! Cline: also add the MCP server in VS Code settings under cline.mcpServers");
  },

  aider: () => {
    const configPath = join(HOME, ".aider.conf.yml");
    appendUnique(
      configPath,
      `# screenshot-mcp: use 'screenshot-mcp serve' as an MCP server in your editor
# aider does not natively support MCP; run screenshot-mcp from your AI editor instead`,
      "screenshot-mcp"
    );
  },

  "github-copilot": () => {
    const instructionsPath = join(HOME, ".github", "copilot-instructions.md");
    appendUnique(
      instructionsPath,
      `## screenshot-mcp

A screenshot MCP server (screenshot-mcp) may be configured in your editor.
When asked to take or view a screenshot, use the MCP tools:
- take_screenshot (mode: fullscreen|window|area)
- read_screenshot (path: string)
- list_screenshots`,
      "screenshot-mcp"
    );
  },
};

export async function install(tools) {
  const all = Object.keys(TOOL_INSTALLERS);
  const targets = tools === "all" ? all : (Array.isArray(tools) ? tools : [tools]);

  for (const tool of targets) {
    const installer = TOOL_INSTALLERS[tool];
    if (!installer) {
      console.log(`  ? Unknown tool: ${tool} (available: ${all.join(", ")})`);
      continue;
    }
    console.log(`\nInstalling for ${tool}...`);
    try {
      await installer();
    } catch (err) {
      console.log(`  ✗ ${tool}: ${err.message}`);
    }
  }

  console.log("\nDone. Restart your AI tool to pick up the new MCP server.");
}

export const AVAILABLE_TOOLS = Object.keys(TOOL_INSTALLERS);
