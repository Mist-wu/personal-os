import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

/** Fixed single-user owner id for this pi-everos-memory install. */
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

/** User-level .env locations (npm install does not ship a repo-root .env). */
function userEnvCandidates(): string[] {
  const home = homedir();
  if (!home) return [];
  return [
    join(home, ".pi", "agent", ".env"),
    join(home, ".config", "everos", ".env"),
    join(home, ".everos", ".env"),
  ];
}

function loadFromEnvFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  return parseEnvForKey(filePath);
}

function walkUpForEnv(startDir: string): string | undefined {
  let dir = startDir;
  const { root } = parse(dir);
  while (true) {
    const value = loadFromEnvFile(join(dir, ".env"));
    if (value) return value;
    if (dir === root) break;
    dir = dirname(dir);
  }
  return undefined;
}

/**
 * Resolve the EverOS API key. Lookup order:
 * 1. `EVEROS_API_KEY` environment variable
 * 2. Walk up from this module's directory (local `pi install "$PWD"` / dev repo)
 * 3. `~/.pi/agent/.env`, `~/.config/everos/.env`, `~/.everos/.env` (npm install)
 * 4. Walk up from `process.cwd()` (pi started inside a project that has `.env`)
 */
export function loadApiKey(): string | undefined {
  const fromEnv = process.env.EVEROS_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  let moduleDir: string;
  try {
    moduleDir = dirname(realpathSync(fileURLToPath(import.meta.url)));
  } catch {
    moduleDir = dirname(fileURLToPath(import.meta.url));
  }

  const fromModule = walkUpForEnv(moduleDir);
  if (fromModule) return fromModule;

  for (const candidate of userEnvCandidates()) {
    const value = loadFromEnvFile(candidate);
    if (value) return value;
  }

  return walkUpForEnv(process.cwd());
}

/** Shown when loadApiKey() returns undefined. */
export const API_KEY_SETUP_HINT =
  "EVEROS_API_KEY not found. Set EVEROS_API_KEY in the environment, add it to ~/.pi/agent/.env (recommended for `pi install npm:...`), or place it in a .env next to a local pi-everos-memory checkout.";
