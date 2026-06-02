import { BASE_URL, DEFAULT_MEMORY_TYPES, DEFAULT_METHOD, loadApiKey, REQUEST_TIMEOUT_MS, USER_ID } from "./config.js";

export type Role = "user" | "assistant";
export type AgentRole = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export class EverOSError extends Error {}

async function callApi(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const apiKey = loadApiKey();
  if (!apiKey) {
    throw new EverOSError(
      "EVEROS_API_KEY not found. Set it in the environment or in personal-os/.env.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      const message =
        (parsed as { message?: string })?.message ?? `HTTP ${response.status} ${response.statusText}`;
      throw new EverOSError(`EverOS ${path} failed: ${message}`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof EverOSError) throw err;
    if (controller.signal.aborted) {
      throw new EverOSError(`EverOS ${path} timed out or was cancelled.`);
    }
    throw new EverOSError(`EverOS ${path} request error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

function unwrap(result: unknown): unknown {
  return (result as { data?: unknown })?.data ?? result;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchOptions {
  query: string;
  topK?: number;
  memoryTypes?: string[];
  method?: string;
  currentTime?: string;
  signal?: AbortSignal;
}

export async function searchMemories(opts: SearchOptions): Promise<unknown> {
  const body: Record<string, unknown> = {
    query: opts.query,
    filters: { user_id: USER_ID },
    method: opts.method ?? DEFAULT_METHOD,
    memory_types: opts.memoryTypes ?? [...DEFAULT_MEMORY_TYPES],
    top_k: opts.topK ?? 5,
  };
  if (opts.currentTime) body.current_time = opts.currentTime;
  return unwrap(await callApi("/api/v1/memories/search", body, opts.signal));
}

/**
 * Surface time-sensitive items (reminders, deadlines, commitments).
 *
 * Note: this EverOS API version does not expose a dedicated `foresight`
 * memory type in search/get (valid types: agent_memory, episodic_memory,
 * profile, raw_message). We therefore do a reminder-focused semantic search
 * over episodic memory + profile, passing current_time for temporal context.
 */
export async function searchForesight(query: string, topK = 10, signal?: AbortSignal): Promise<unknown> {
  return searchMemories({
    query,
    topK,
    memoryTypes: ["episodic_memory", "profile"],
    currentTime: new Date().toISOString(),
    ...(signal ? { signal } : {}),
  });
}

// ---------------------------------------------------------------------------
// Get (structured retrieval)
// ---------------------------------------------------------------------------

export type GetMemoryType = "episodic_memory" | "profile" | "agent_case" | "agent_skill";

export interface GetOptions {
  memoryType: GetMemoryType;
  pageSize?: number;
  page?: number;
  sinceMs?: number;
  signal?: AbortSignal;
}

export async function getMemories(opts: GetOptions): Promise<unknown> {
  const filters: Record<string, unknown> = { user_id: USER_ID };
  if (opts.sinceMs !== undefined) {
    filters.AND = [{ timestamp: { gte: opts.sinceMs } }];
  }
  return unwrap(
    await callApi(
      "/api/v1/memories/get",
      {
        memory_type: opts.memoryType,
        filters,
        page: opts.page ?? 1,
        page_size: opts.pageSize ?? 20,
        rank_by: "timestamp",
        rank_order: "desc",
      },
      opts.signal,
    ),
  );
}

export function getProfile(signal?: AbortSignal): Promise<unknown> {
  return getMemories({ memoryType: "profile", pageSize: 10, ...(signal ? { signal } : {}) });
}

export function getEpisodes(limit = 10, days?: number, signal?: AbortSignal): Promise<unknown> {
  const sinceMs = days !== undefined ? Date.now() - days * 86_400_000 : undefined;
  return getMemories({
    memoryType: "episodic_memory",
    pageSize: limit,
    ...(sinceMs !== undefined ? { sinceMs } : {}),
    ...(signal ? { signal } : {}),
  });
}

export function getAgentSkills(limit = 20, signal?: AbortSignal): Promise<unknown> {
  return getMemories({ memoryType: "agent_skill", pageSize: limit, ...(signal ? { signal } : {}) });
}

export function getAgentCases(limit = 20, signal?: AbortSignal): Promise<unknown> {
  return getMemories({ memoryType: "agent_case", pageSize: limit, ...(signal ? { signal } : {}) });
}

// ---------------------------------------------------------------------------
// Add (user memories + agent trajectories)
// ---------------------------------------------------------------------------

export async function addMemories(messages: ChatMessage[], sessionId?: string, signal?: AbortSignal): Promise<unknown> {
  const now = Date.now();
  const payload: Record<string, unknown> = {
    user_id: USER_ID,
    messages: messages.map((m, i) => ({ role: m.role, content: m.content, timestamp: now + i })),
  };
  if (sessionId) payload.session_id = sessionId;

  const addResult = unwrap(await callApi("/api/v1/memories", payload, signal));

  const flushPayload: Record<string, unknown> = { user_id: USER_ID };
  if (sessionId) flushPayload.session_id = sessionId;
  const flushResult = unwrap(await callApi("/api/v1/memories/flush", flushPayload, signal));

  return { add: addResult, flush: flushResult };
}

export interface AgentMessage {
  role: AgentRole;
  content: string;
}

/**
 * Record an agent task trajectory so EverOS can distill agent_case / agent_skill.
 * Tool steps should be summarized into assistant messages (tool role with
 * tool_call_id is intentionally not exposed to keep the agent-facing API simple).
 */
export async function addAgentMemory(messages: AgentMessage[], sessionId?: string, signal?: AbortSignal): Promise<unknown> {
  const now = Date.now();
  const payload: Record<string, unknown> = {
    user_id: USER_ID,
    messages: messages.map((m, i) => ({ role: m.role, content: m.content, timestamp: now + i })),
  };
  if (sessionId) payload.session_id = sessionId;

  const addResult = unwrap(await callApi("/api/v1/memories/agent", payload, signal));

  const flushPayload: Record<string, unknown> = { user_id: USER_ID };
  if (sessionId) flushPayload.session_id = sessionId;
  const flushResult = unwrap(await callApi("/api/v1/memories/agent/flush", flushPayload, signal));

  return { add: addResult, flush: flushResult };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
//
// /api/v1/memories/delete has two mutually exclusive modes and returns 204:
//   - single: { memory_id } only, where memory_id is a MEMCELL id (the
//     `parent_id` returned by search/episodes — NOT an episode/atomic-fact id).
//   - batch:  filters (user_id / group_id [+ session_id / sender_id]).
// Note: delete removes the canonical record immediately (visible via /get),
// but the search index is eventually consistent and may briefly still return
// the just-deleted item (with a blanked summary). Verify via getEpisodes.

export interface DeleteOptions {
  memcellId?: string;
  sessionId?: string;
  senderId?: string;
  signal?: AbortSignal;
}

export async function deleteMemories(opts: DeleteOptions): Promise<unknown> {
  if (opts.memcellId) {
    // Single delete: memory_id only, no filter fields allowed.
    await callApi("/api/v1/memories/delete", { memory_id: opts.memcellId }, opts.signal);
    return { deleted: true, mode: "single", memcell_id: opts.memcellId };
  }
  if (opts.sessionId || opts.senderId) {
    const body: Record<string, unknown> = { user_id: USER_ID };
    if (opts.sessionId) body.session_id = opts.sessionId;
    if (opts.senderId) body.sender_id = opts.senderId;
    await callApi("/api/v1/memories/delete", body, opts.signal);
    return { deleted: true, mode: "batch", ...body };
  }
  throw new EverOSError(
    "Refusing to delete: provide memcellId (single, a MemCell/parent_id) or a sessionId/senderId filter (batch).",
  );
}
