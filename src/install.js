import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const HOME = homedir();
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function which(cmd) {
  try {
    return execSync(`command -v ${cmd}`, { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function resolveServerCmd() {
  // Portable entry only — never hardcode absolute machine paths into MCP configs.
  // Prefer a global install on PATH; otherwise npx from the registry.
  if (which("rudycanshoot")) {
    return { command: "rudycanshoot", args: ["serve"] };
  }
  if (which("screenshot-mcp")) {
    return { command: "screenshot-mcp", args: ["serve"] };
  }
  return { command: "npx", args: ["-y", "rudycanshoot", "serve"] };
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
    settings.mcpServers["rudycanshoot"] = MCP_ENTRY;
    // Keep legacy alias so existing chats keep working
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
1. Call \`mcp__rudycanshoot__take_screenshot\` with the appropriate mode
2. Call \`mcp__rudycanshoot__read_screenshot\` with the returned path
3. Describe what you see in the screenshot

For visual monitoring over time, use \`record_video\` (returns frames the model can watch).
`
      );
    }
  },

  cursor: () => {
    const configPath = join(HOME, ".cursor", "mcp.json");
    const config = readJson(configPath);
    config.mcpServers = config.mcpServers || {};
    config.mcpServers["rudycanshoot"] = MCP_ENTRY;
    config.mcpServers["screenshot-mcp"] = MCP_ENTRY;
    writeJson(configPath, config);

    // Project-local MCP config when installing from a checkout
    const projectMcp = join(PKG_ROOT, ".cursor", "mcp.json");
    writeJson(projectMcp, {
      mcpServers: {
        rudycanshoot: MCP_ENTRY,
      },
    });
    writeJson(join(PKG_ROOT, ".mcp.json"), {
      mcpServers: {
        rudycanshoot: MCP_ENTRY,
      },
    });
  },

  windsurf: () => {
    const configPath = join(HOME, ".codeium", "windsurf", "mcp_config.json");
    const config = readJson(configPath);
    config.mcpServers = config.mcpServers || {};
    config.mcpServers["rudycanshoot"] = MCP_ENTRY;
    writeJson(configPath, config);
  },

  codex: () => {
    const agentsPath = join(HOME, "AGENTS.md");
    appendUnique(
      agentsPath,
      `## rudycanshoot

MCP server available: \`rudycanshoot\`
- \`take_screenshot\` — capture screen/window/area, returns file path
- \`read_screenshot\` — read a screenshot as base64 image
- \`list_screenshots\` — list recent captures
- \`record_video\` — temporary screen recording; returns frames the AI can watch
- \`read_video\` — extract frames from a saved video for visual review

Use these tools whenever asked to take a screenshot, record the screen, or inspect the screen.`,
      "rudycanshoot"
    );
  },

  gemini: () => {
    const settingsPath = join(HOME, ".gemini", "settings.json");
    const settings = readJson(settingsPath);
    settings.mcpServers = settings.mcpServers || {};
    settings.mcpServers["rudycanshoot"] = MCP_ENTRY;
    writeJson(settingsPath, settings);
  },

  opencode: () => {
    // OpenCode expects servers directly under mcp, with type + command array
    // (not Claude/Cursor-style mcp.servers + command/args).
    // Docs: https://opencode.ai/docs/mcp-servers/
    const configPath = join(HOME, ".config", "opencode", "opencode.json");
    const config = readJson(configPath);
    config.mcp = config.mcp || {};
    // Migrate legacy mcp.servers shape if present
    if (config.mcp.servers && typeof config.mcp.servers === "object") {
      for (const [name, entry] of Object.entries(config.mcp.servers)) {
        if (!config.mcp[name]) config.mcp[name] = entry;
      }
      delete config.mcp.servers;
    }
    config.mcp["rudycanshoot"] = {
      type: "local",
      command: [command, ...args],
      enabled: true,
    };
    if (!config.$schema) config.$schema = "https://opencode.ai/config.json";
    writeJson(configPath, config);

    const agentDir = join(HOME, ".config", "opencode", "agents");
    mkdirSync(agentDir, { recursive: true });
    const agentPath = join(agentDir, "screenshot.md");
    if (!existsSync(agentPath)) {
      writeText(
        agentPath,
        `---
name: Screenshot
description: Take and view screenshots / short screen videos
---

Use the rudycanshoot MCP server to capture screens.
Tools: take_screenshot, read_screenshot, list_screenshots, record_video, read_video
`
      );
    }
  },

  continue: () => {
    const configPath = join(HOME, ".continue", "config.json");
    const config = readJson(configPath);
    config.mcpServers = config.mcpServers || [];
    if (!config.mcpServers.find((s) => s.name === "rudycanshoot")) {
      config.mcpServers.push({ name: "rudycanshoot", ...MCP_ENTRY });
      writeJson(configPath, config);
    } else {
      console.log(`  ~ ${configPath} (already configured)`);
    }
  },

  cline: () => {
    const rulesDir = join(HOME, ".clinerules");
    mkdirSync(rulesDir, { recursive: true });
    const rulePath = join(rulesDir, "rudycanshoot.md");
    if (!existsSync(rulePath)) {
      writeText(
        rulePath,
        `# rudycanshoot

MCP server: rudycanshoot
Available tools: take_screenshot, read_screenshot, list_screenshots, record_video, read_video, list_videos, cleanup_videos

When the user asks to take a screenshot, record the screen, inspect the screen, or show what's on screen,
use the rudycanshoot tools to capture and read the image/video frames.
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
      `# rudycanshoot: use 'rudycanshoot serve' as an MCP server in your editor
# aider does not natively support MCP; run rudycanshoot from your AI editor instead`,
      "rudycanshoot"
    );
  },

  "github-copilot": () => {
    const instructionsPath = join(HOME, ".github", "copilot-instructions.md");
    appendUnique(
      instructionsPath,
      `## rudycanshoot

A screenshot/video MCP server (rudycanshoot) may be configured in your editor.
When asked to take or view a screenshot or short screen recording, use the MCP tools:
- take_screenshot / read_screenshot / list_screenshots
- record_video / read_video / list_videos / cleanup_videos`,
      "rudycanshoot"
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
