# AGENTS.md — pi-everos-memory

A pi extension package that exposes EverOS long-term memory as model-callable tools.

## Module map

- `src/index.ts` — extension entry; default export registers tools.
- `src/tools.ts` — 9 tools (typebox params, `pi.registerTool`):
  user memory `memory_search` / `memory_add` / `memory_profile` / `memory_episodes` / `memory_foresight` / `memory_delete`;
  agent memory `agent_skills` / `agent_cases` / `agent_record`.
- `src/everos.ts` — EverOS REST client over `fetch` (search, get, add+flush, agent add+flush, delete).
- `src/config.ts` — constants (`USER_ID=wu`, method, base URL) and `loadApiKey()` (env or `.env` walk-up).
- `src/prompts.ts` — `TOOL_PROMPT_GUIDELINES` shared by all tools.
- `test/` — manifest + unit tests (`node --import tsx --test`).

## Conventions

- Pure TypeScript; no Python/native deps. Cloud-only EverOS.
- pi bundles `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox` at runtime; they are optional peer deps.
- Recording is agent-judged (LLM calls `memory_add`), not automatic.
- `memory_delete` single mode uses the **MemCell id** (= search result `parent_id`), not episode/atomic_fact ids; returns 204. Search is eventually consistent (deleted items linger briefly); `/memories/get` is canonical. No interactive confirmation.
- Prefer correcting facts via `memory_add` (consolidation supersedes); delete only to truly remove.
- Run `npm run verify` (typecheck + tests) before committing.
