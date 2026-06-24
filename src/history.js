import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { defaultOutputDir } from "./screenshot.js";

const HISTORY_FILE = join(defaultOutputDir(), ".history.json");

async function loadHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, "utf8"));
  } catch {
    return { entries: [] };
  }
}

async function saveHistory(data) {
  await writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
}

export async function recordCapture(path, meta = {}) {
  const history = await loadHistory();
  history.entries.push({
    path,
    timestamp: new Date().toISOString(),
    ...meta,
  });
  if (history.entries.length > 1000) {
    history.entries = history.entries.slice(-1000);
  }
  await saveHistory(history);
}

export async function getHistory(limit = 50, filter = {}) {
  const history = await loadHistory();
  let entries = history.entries;

  if (filter.tag) {
    entries = entries.filter((e) => e.tags && e.tags.includes(filter.tag));
  }
  if (filter.since) {
    const since = new Date(filter.since).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= since);
  }

  return entries.slice(-limit).reverse();
}

export async function tagCapture(path, tags) {
  const history = await loadHistory();
  const entry = history.entries.find((e) => e.path === path);
  if (entry) {
    entry.tags = [...new Set([...(entry.tags || []), ...tags])];
    await saveHistory(history);
    return true;
  }
  return false;
}

export async function clearHistory() {
  await saveHistory({ entries: [] });
}
