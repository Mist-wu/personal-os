import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { API_KEY_SETUP_HINT, BASE_URL, DEFAULT_MEMORY_TYPES, DEFAULT_METHOD, loadApiKey, REQUEST_TIMEOUT_MS, USER_ID } from "./config.js";

export type Role = "user" | "assistant";
export type AgentRole = "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
}

// ---------------------------------------------------------------------------
// Multimodal content
// ---------------------------------------------------------------------------
// A message `content` may be a plain string or an array of ContentItems. File
// items reference an `objectKey` obtained from the /object/sign upload flow.

export type ContentItemType = "text" | "image" | "audio" | "doc" | "pdf" | "html" | "email";

export interface ContentItem {
  type: ContentItemType;
  text?: string;
  /** objectKey returned by the /object/sign upload flow (for non-text items). */
  uri?: string;
  name?: string;
  ext?: string;
  source?: string;
}

export type MessageContent = string | ContentItem[];

export class EverOSError extends Error {}

async function callApi(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const apiKey = loadApiKey();
  if (!apiKey) {
    throw new EverOSError(API_KEY_SETUP_HINT);
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

export type SearchMethod = "keyword" | "vector" | "hybrid" | "agentic";

export interface SearchOptions {
  query: string;
  topK?: number;
  memoryTypes?: string[];
  method?: SearchMethod;
  currentTime?: string;
  /** Cosine similarity threshold (0.0-1.0) for vector-based methods. */
  radius?: number;
  /** Return the original source data alongside each result. */
  includeOriginalData?: boolean;
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
  if (opts.radius !== undefined) body.radius = opts.radius;
  if (opts.includeOriginalData !== undefined) body.include_original_data = opts.includeOriginalData;
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

interface BuiltMessage {
  role: Role;
  content: MessageContent;
  timestamp: number;
}

/** Merge uploaded attachments into the last user message (or append a new one). */
function attachToLastUser(messages: BuiltMessage[], attachments: ContentItem[], baseTimestamp: number): void {
  if (attachments.length === 0) return;

  let targetIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === "user") {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) {
    messages.push({ role: "user", content: attachments, timestamp: baseTimestamp + messages.length });
    return;
  }

  const target = messages[targetIndex]!;
  const items: ContentItem[] = [];
  if (typeof target.content === "string") {
    if (target.content) items.push({ type: "text", text: target.content });
  } else {
    items.push(...target.content);
  }
  items.push(...attachments);
  target.content = items;
}

export async function addMemories(
  messages: ChatMessage[],
  sessionId?: string,
  signal?: AbortSignal,
  attachments?: ContentItem[],
): Promise<unknown> {
  const now = Date.now();
  const built: BuiltMessage[] = messages.map((m, i) => ({ role: m.role, content: m.content, timestamp: now + i }));
  if (attachments && attachments.length > 0) attachToLastUser(built, attachments, now);

  const payload: Record<string, unknown> = { user_id: USER_ID, messages: built };
  if (sessionId) payload.session_id = sessionId;

  const addResult = unwrap(await callApi("/api/v1/memories", payload, signal));

  const flushPayload: Record<string, unknown> = { user_id: USER_ID };
  if (sessionId) flushPayload.session_id = sessionId;
  const flushResult = unwrap(await callApi("/api/v1/memories/flush", flushPayload, signal));

  return { add: addResult, flush: flushResult };
}

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export interface AgentMessage {
  role: AgentRole;
  /** Optional for an assistant message that only carries tool_calls. */
  content?: string;
  /** Tool calls issued by an assistant message (OpenAI format). */
  tool_calls?: ToolCall[];
  /** Required when role is "tool": the id of the tool_call this responds to. */
  tool_call_id?: string;
}

/**
 * Record an agent task trajectory so EverOS can distill agent_case / agent_skill.
 * Supports faithful tool-use traces: assistant messages may carry `tool_calls`
 * (OpenAI format) and `tool` messages carry their result content + `tool_call_id`.
 * Plain assistant summaries of tool steps also remain valid.
 */
export async function addAgentMemory(messages: AgentMessage[], sessionId?: string, signal?: AbortSignal): Promise<unknown> {
  const now = Date.now();
  const payload: Record<string, unknown> = {
    user_id: USER_ID,
    messages: messages.map((m, i) => {
      const item: Record<string, unknown> = { role: m.role, timestamp: now + i };
      if (m.content !== undefined) item.content = m.content;
      if (m.tool_calls && m.tool_calls.length > 0) item.tool_calls = m.tool_calls;
      if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
      return item;
    }),
  };
  if (sessionId) payload.session_id = sessionId;

  const addResult = unwrap(await callApi("/api/v1/memories/agent", payload, signal));

  const flushPayload: Record<string, unknown> = { user_id: USER_ID };
  if (sessionId) flushPayload.session_id = sessionId;
  const flushResult = unwrap(await callApi("/api/v1/memories/agent/flush", flushPayload, signal));

  return { add: addResult, flush: flushResult };
}

// ---------------------------------------------------------------------------
// Multimodal upload (/object/sign -> S3 presigned POST)
// ---------------------------------------------------------------------------
// Three-step flow: sign -> upload to S3 -> reference the returned objectKey as
// a ContentItem `uri`. Note: /object/sign uses a non-standard response envelope
// ({ result: { data: { objectList } } }), not the usual { data } wrapper.

interface FileKind {
  contentType: ContentItemType;
  /** fileType expected by /object/sign. */
  signFileType: "image" | "file";
  mime: string;
}

const EXT_KINDS: Record<string, FileKind> = {
  jpg: { contentType: "image", signFileType: "image", mime: "image/jpeg" },
  jpeg: { contentType: "image", signFileType: "image", mime: "image/jpeg" },
  png: { contentType: "image", signFileType: "image", mime: "image/png" },
  gif: { contentType: "image", signFileType: "image", mime: "image/gif" },
  webp: { contentType: "image", signFileType: "image", mime: "image/webp" },
  pdf: { contentType: "pdf", signFileType: "file", mime: "application/pdf" },
  doc: { contentType: "doc", signFileType: "file", mime: "application/msword" },
  txt: { contentType: "doc", signFileType: "file", mime: "text/plain" },
  html: { contentType: "html", signFileType: "file", mime: "text/html" },
  htm: { contentType: "html", signFileType: "file", mime: "text/html" },
  eml: { contentType: "email", signFileType: "file", mime: "message/rfc822" },
  mp3: { contentType: "audio", signFileType: "file", mime: "audio/mpeg" },
  wav: { contentType: "audio", signFileType: "file", mime: "audio/wav" },
};

function classifyExt(ext: string): FileKind {
  const kind = EXT_KINDS[ext];
  if (!kind) {
    throw new EverOSError(`Unsupported attachment ".${ext}". Supported: ${Object.keys(EXT_KINDS).join(", ")}.`);
  }
  return kind;
}

interface SignedObject {
  objectKey: string;
  url: string;
  fields: Record<string, string>;
}

async function signObjects(
  objects: { fileId: string; fileName: string; fileType: string }[],
  signal?: AbortSignal,
): Promise<Map<string, SignedObject>> {
  const res = await callApi("/api/v1/object/sign", { objectList: objects }, signal);
  const list = (res as { result?: { data?: { objectList?: unknown[] } } })?.result?.data?.objectList ?? [];
  const map = new Map<string, SignedObject>();
  for (const raw of list) {
    const o = raw as {
      fileId?: string;
      objectKey?: string;
      objectSignedInfo?: { url?: string; fields?: Record<string, string> };
    };
    if (!o.fileId || !o.objectKey || !o.objectSignedInfo?.url) continue;
    map.set(o.fileId, {
      objectKey: o.objectKey,
      url: o.objectSignedInfo.url,
      fields: o.objectSignedInfo.fields ?? {},
    });
  }
  return map;
}

async function uploadToS3(signed: SignedObject, data: Uint8Array, fileName: string, mime: string, signal?: AbortSignal): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(signed.fields)) form.append(k, v);
  // S3 presigned POST requires the file field to come last. The cast bridges
  // Node's Uint8Array<ArrayBufferLike> to the DOM BlobPart type (no copy).
  form.append("file", new Blob([data as BlobPart], { type: mime }), fileName);

  const res = await fetch(signed.url, { method: "POST", body: form, ...(signal ? { signal } : {}) });
  if (res.status !== 204 && !res.ok) {
    const text = await res.text().catch(() => "");
    throw new EverOSError(`S3 upload of ${fileName} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

/**
 * Sign + upload local files, returning ContentItems (uri = objectKey) ready to
 * attach to addMemories. Network / file / unsupported-type errors surface as
 * EverOSError. Note: not covered by unit tests (requires live API + real files).
 */
export async function uploadLocalFiles(paths: string[], signal?: AbortSignal): Promise<ContentItem[]> {
  if (paths.length === 0) return [];

  const metas = paths.map((path, i) => {
    const name = basename(path);
    const ext = extname(path).replace(/^\./, "").toLowerCase();
    return { fileId: `f_${Date.now()}_${i}`, path, name, ext, kind: classifyExt(ext) };
  });

  const signed = await signObjects(
    metas.map((m) => ({ fileId: m.fileId, fileName: m.name, fileType: m.kind.signFileType })),
    signal,
  );

  const items: ContentItem[] = [];
  for (const m of metas) {
    const sig = signed.get(m.fileId);
    if (!sig) throw new EverOSError(`/object/sign returned no signed URL for ${m.name}.`);
    const data = await readFile(m.path);
    await uploadToS3(sig, data, m.name, m.kind.mime, signal);
    items.push({ type: m.kind.contentType, uri: sig.objectKey, name: m.name, ext: m.ext });
  }
  return items;
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
