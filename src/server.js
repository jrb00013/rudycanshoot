import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { takeScreenshot, defaultOutputDir } from "./screenshot.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const server = new McpServer({
  name: "screenshot-mcp",
  version: "1.0.0",
});

server.tool(
  "take_screenshot",
  "Capture a screenshot of the screen, active window, or a region. Returns the file path of the saved image.",
  {
    mode: z
      .enum(["fullscreen", "window", "area"])
      .default("fullscreen")
      .describe("What to capture"),
    area: z
      .string()
      .optional()
      .describe("Region as 'x,y,width,height' — only used when mode=area"),
    filename: z
      .string()
      .optional()
      .describe("Output filename (default: screenshot-<timestamp>.png)"),
    outputDir: z
      .string()
      .optional()
      .describe("Directory to save into (default: ~/.screenshot-mcp/captures/)"),
  },
  async ({ mode, area, filename, outputDir }) => {
    const path = await takeScreenshot({
      window: mode === "window",
      area: mode === "area" ? area : undefined,
      filename,
      outputDir,
    });
    return {
      content: [
        {
          type: "text",
          text: `Screenshot saved: ${path}`,
        },
        {
          type: "resource",
          resource: {
            uri: `file://${path}`,
            mimeType: "image/png",
            name: basename(path),
          },
        },
      ],
    };
  }
);

server.tool(
  "read_screenshot",
  "Read a previously captured screenshot as base64 so the AI can view it.",
  {
    path: z.string().describe("Absolute path to the screenshot file"),
  },
  async ({ path }) => {
    const data = await readFile(path);
    const ext = extname(path).slice(1).toLowerCase();
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return {
      content: [
        {
          type: "image",
          data: data.toString("base64"),
          mimeType,
        },
      ],
    };
  }
);

server.tool(
  "list_screenshots",
  "List recent screenshots captured by this tool.",
  {
    limit: z.number().int().min(1).max(100).default(20).describe("Max number of results"),
  },
  async ({ limit }) => {
    const dir = defaultOutputDir();
    let files;
    try {
      files = await readdir(dir);
    } catch {
      return { content: [{ type: "text", text: "No screenshots yet." }] };
    }

    const imageFiles = files.filter((f) =>
      [".png", ".jpg", ".jpeg", ".xwd"].includes(extname(f).toLowerCase())
    );

    const withStats = await Promise.all(
      imageFiles.map(async (f) => {
        const fullPath = join(dir, f);
        const s = await stat(fullPath);
        return { name: f, path: fullPath, mtime: s.mtimeMs, size: s.size };
      })
    );

    withStats.sort((a, b) => b.mtime - a.mtime);
    const recent = withStats.slice(0, limit);

    if (recent.length === 0) {
      return { content: [{ type: "text", text: "No screenshots found." }] };
    }

    const lines = recent.map(
      (f) =>
        `${new Date(f.mtime).toISOString().slice(0, 19)}  ${(f.size / 1024).toFixed(1)}K  ${f.path}`
    );

    return {
      content: [
        {
          type: "text",
          text: `Recent screenshots (${recent.length}):\n\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "capture_command",
  "Run a shell command and render its output as a styled terminal screenshot PNG. Works without a display — uses Python/Pillow to render text on a dark terminal background. Returns the file path.",
  {
    command: z.string().describe("Shell command to run (passed to sh -c)"),
    title: z.string().optional().describe("Title bar label (default: the command itself)"),
    outputDir: z.string().optional().describe("Directory to save into"),
    filename: z.string().optional().describe("Output filename (default: terminal-<timestamp>.png)"),
    timeout: z.number().int().min(1).max(120).default(30).describe("Command timeout in seconds"),
    fontSize: z.number().int().min(8).max(24).default(13).describe("Font size for rendering"),
  },
  async ({ command, title, outputDir, filename, timeout, fontSize }) => {
    const dir = outputDir || defaultOutputDir();
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = filename || `terminal-${ts}.png`;
    const outPath = join(dir, name);

    const renderScript = join(__dirname, "terminal_render.py");
    const args = [
      renderScript,
      "--cmd", command,
      "--output", outPath,
      "--timeout", String(timeout),
      "--font-size", String(fontSize),
    ];
    if (title) args.push("--title", title);

    try {
      await execFileAsync("python3", args, { timeout: (timeout + 10) * 1000 });
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to render terminal screenshot: ${err.message}` }],
      };
    }

    return {
      content: [
        { type: "text", text: `Terminal screenshot saved: ${outPath}` },
        {
          type: "resource",
          resource: {
            uri: `file://${outPath}`,
            mimeType: "image/png",
            name: basename(outPath),
          },
        },
      ],
    };
  }
);

export async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("screenshot-mcp server started\n");
}
