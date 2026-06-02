import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

/** Fixed single-user owner id for this personal-os install. */
export const USER_ID = "wu";

/** Default retrieval method. hybrid = BM25 + vector + RRF rerank. */
export const DEFAULT_METHOD = "hybrid" as const;

/** Default memory types returned by search. */
export const DEFAULT_MEMORY_TYPES = ["episodic_memory", "profile"] as const;

/** EverOS cloud API base URL. Override with EVEROS_BASE_URL. */
export const BASE_URL = process.env.EVEROS_BASE_URL?.replace(/\/$/, "") || "https://api.evermind.ai";

/** Request timeout (ms). agentic search needs more; keep generous. */
export const REQUEST_TIMEOUT_MS = 60_000;

function parseEnvForKey(filePath: string): string | undefined {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key !== "EVEROS_API_KEY") continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value || undefined;
    }
  } catch {
    // ignore unreadable files
  }
  return undefined;
}

/**
 * Resolve the EverOS API key. Prefers the EVEROS_API_KEY env var, otherwise
 * walks up from this module's real location looking for a .env that defines it
 * (so the key in personal-os/.env is found even when loaded via a global symlink).
 */
export function loadApiKey(): string | undefined {
  const fromEnv = process.env.EVEROS_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  let dir: string;
  try {
    dir = dirname(realpathSync(fileURLToPath(import.meta.url)));
  } catch {
    dir = dirname(fileURLToPath(import.meta.url));
  }

  const { root } = parse(dir);
  while (true) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      const value = parseEnvForKey(candidate);
      if (value) return value;
    }
    if (dir === root) break;
    dir = dirname(dir);
  }
  return undefined;
}
