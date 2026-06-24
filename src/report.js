import { getHistory } from "./history.js";
import { makeGrid } from "./grid.js";
import { getImageMetadata } from "./metadata.js";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { defaultOutputDir } from "./screenshot.js";

export async function generateReport(opts = {}) {
  const {
    limit = 50,
    tag = null,
    since = null,
    outputDir = defaultOutputDir(),
    format = "markdown",
    gridOutput = null,
  } = opts;

  const entries = await getHistory(limit, { tag, since });

  if (entries.length === 0) {
    return { entries: [], report: "No screenshots found matching criteria." };
  }

  const withMeta = await Promise.all(
    entries.map(async (e) => {
      try {
        const meta = await getImageMetadata(e.path);
        return { ...e, meta };
      } catch {
        return { ...e, meta: null };
      }
    })
  );

  if (gridOutput) {
    const paths = withMeta.filter((e) => e.meta).map((e) => e.path);
    if (paths.length > 0) {
      await makeGrid(paths, gridOutput, {
        cols: Math.min(4, paths.length),
        cellWidth: 400,
        cellHeight: 300,
        labels: withMeta.filter((e) => e.meta).map((e) => e.timestamp.slice(0, 16)),
      });
    }
  }

  let report = "";
  if (format === "markdown") {
    report = `# Screenshot Report\n\nGenerated: ${new Date().toISOString()}\nTotal: ${entries.length}\n\n`;
    report += "| # | Timestamp | Path | Size | Dimensions | Tags |\n";
    report += "|---|-----------|------|------|------------|------|\n";
    withMeta.forEach((e, i) => {
      const dims = e.meta ? `${e.meta.width}×${e.meta.height}` : "—";
      const size = e.meta ? `${e.meta.sizeKb}K` : "—";
      const tags = (e.tags || []).join(", ") || "—";
      report += `| ${i + 1} | ${e.timestamp.slice(0, 16)} | \`${e.path}\` | ${size} | ${dims} | ${tags} |\n`;
    });
  }

  return { entries: withMeta, report, gridOutput };
}
