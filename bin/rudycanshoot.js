#!/usr/bin/env node
import { program } from "commander";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, "../package.json"));

program
  .name("screenshot-mcp")
  .description(pkg.description)
  .version(pkg.version);

program
  .command("serve")
  .description("Start the MCP server (stdio transport — used by AI tools)")
  .action(async () => {
    const { startServer } = await import("../src/server.js");
    await startServer();
  });

program
  .command("capture")
  .description("Take a screenshot from the command line")
  .option("-m, --mode <mode>", "fullscreen | window | area", "fullscreen")
  .option("-a, --area <x,y,w,h>", "Region to capture (requires --mode area)")
  .option("-o, --output <path>", "Output file path")
  .option("-d, --dir <dir>", "Output directory")
  .action(async (opts) => {
    const { takeScreenshot } = await import("../src/screenshot.js");
    const path = await takeScreenshot({
      window: opts.mode === "window",
      area: opts.mode === "area" ? opts.area : undefined,
      filename: opts.output ? require("path").basename(opts.output) : undefined,
      outputDir: opts.dir || (opts.output ? require("path").dirname(opts.output) : undefined),
    });
    console.log(path);
  });

program
  .command("install")
  .description("Auto-configure AI tools to use this MCP server")
  .option("--all", "Install for all supported tools")
  .option(
    "--tool <tool>",
    "Install for a specific tool (claude-code, cursor, windsurf, codex, gemini, opencode, continue, cline, aider, github-copilot)"
  )
  .action(async (opts) => {
    const { install, AVAILABLE_TOOLS } = await import("../src/install.js");
    if (!opts.all && !opts.tool) {
      console.log("Supported tools:", AVAILABLE_TOOLS.join(", "));
      console.log("Use --all to install for all, or --tool <name> for one.");
      process.exit(1);
    }
    await install(opts.all ? "all" : opts.tool);
  });

program
  .command("list")
  .description("List recent screenshots")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (opts) => {
    const { readdir, stat } = await import("node:fs/promises");
    const { extname } = await import("node:path");
    const { join } = await import("node:path");
    const { defaultOutputDir } = await import("../src/screenshot.js");
    const dir = defaultOutputDir();
    const files = await readdir(dir).catch(() => []);
    const imgs = files.filter((f) =>
      [".png", ".jpg", ".jpeg", ".xwd"].includes(extname(f).toLowerCase())
    );
    const withStats = await Promise.all(
      imgs.map(async (f) => {
        const fp = join(dir, f);
        const s = await stat(fp);
        return { path: fp, mtime: s.mtimeMs, size: s.size };
      })
    );
    withStats.sort((a, b) => b.mtime - a.mtime);
    withStats.slice(0, Number(opts.limit)).forEach((f) => {
      console.log(`${new Date(f.mtime).toISOString().slice(0, 19)}  ${(f.size / 1024).toFixed(1)}K  ${f.path}`);
    });
  });

program.parse();
