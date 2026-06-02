# pi-everos-memory

EverOS-backed long-term memory for [pi](https://github.com/earendil-works/pi-mono).

Gives the agent model-callable tools so it can remember and recall across
sessions, getting to know you (`user_id = wu`) through ongoing conversation.

User memory:

- `memory_search` — recall relevant past context, preferences, facts, decisions.
- `memory_add` — store this turn's salient messages when worth remembering.
- `memory_profile` — retrieve the consolidated user profile EverOS has built.
- `memory_episodes` — recent episodes in reverse-chronological order (review/retrospective).
- `memory_foresight` — surface reminders, deadlines, and time-sensitive items.
- `memory_delete` — permanently forget a memory (by MemCell `parent_id`) or a whole session.

Agent memory:

- `agent_skills` — recall reusable skills distilled from past task trajectories.
- `agent_cases` — recall concrete past approaches to similar tasks.
- `agent_record` — record a completed task trajectory worth learning from.

Memory lives in [EverOS](https://docs.evermind.ai) (cloud). The agent decides
when to record (`memory_add`, `agent_record`) — recording is not automatic.

> Correcting a fact: prefer to just `memory_add` the corrected statement —
> EverOS resolves contradictions via consolidation and supersedes the stale
> profile entry on its own. Use `memory_delete` only to truly remove data.
>
> `memory_delete` takes a **MemCell id** (the `parent_id` of a search/episodes
> result, not the episode/atomic_fact id) and returns 204. Deletion is immediate
> in the canonical store (`memory_episodes`), but the search index is eventually
> consistent and may briefly still return the deleted item.

> Note: this EverOS API version has no dedicated `foresight` type in search/get,
> so `memory_foresight` is a reminder-focused semantic search over episodic +
> profile memory (with `current_time`).

## How it works

Pure TypeScript. The tools call the EverOS REST API (`https://api.evermind.ai`)
directly with `fetch` — no Python, no extra runtime. Fixed defaults: single user
`wu`, `hybrid` retrieval, `assistant` scenario mode.

## Setup

1. Get an API key from <https://everos.evermind.ai> and put it in the
   personal-os repo `.env` (gitignored), or export it:

   ```
   EVEROS_API_KEY="<your_key>"
   ```

   The extension reads `EVEROS_API_KEY` from the environment, or walks up from
   its own location to find a `.env` that defines it.

2. Install it as a pi package (local-path source). This registers the package
   in your user settings (`~/.pi/agent/settings.json`) and loads it in every
   session, while the source stays version-controlled here:

   ```bash
   pi install /Users/wu/Github/personal-os/.pi/extensions/everos-memory
   ```

   - Use `-l` instead to install into project settings (`.pi/settings.json`),
     shared with the repo: `pi install -l ./.pi/extensions/everos-memory`.
   - `pi list` shows installed packages; `pi remove <source>` uninstalls;
     `pi config` enables/disables individual resources.
   - pi bundles `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and
     `typebox` at runtime, so no `npm install` is needed just to load it.

## Development

```bash
npm install        # only needed for typecheck/tests
npm run verify     # typecheck + tests
```

## Configuration

| Env var           | Default                     | Purpose              |
| ----------------- | --------------------------- | -------------------- |
| `EVEROS_API_KEY`  | (from `.env`)               | EverOS auth          |
| `EVEROS_BASE_URL` | `https://api.evermind.ai`   | API base URL         |
