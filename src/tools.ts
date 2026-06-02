import { StringEnum } from "@earendil-works/pi-ai";
import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  addAgentMemory,
  addMemories,
  type AgentMessage,
  type ChatMessage,
  deleteMemories,
  getAgentCases,
  getAgentSkills,
  getEpisodes,
  getProfile,
  searchForesight,
  searchMemories,
} from "./everos.js";
import { TOOL_PROMPT_GUIDELINES } from "./prompts.js";

const MAX_OUTPUT_CHARS = 8000;

function jsonResult(data: unknown): AgentToolResult<{ error: string | null }> {
  let text = JSON.stringify(data, null, 2);
  if (text.length > MAX_OUTPUT_CHARS) {
    text = `${text.slice(0, MAX_OUTPUT_CHARS)}\n... [truncated]`;
  }
  return { content: [{ type: "text", text }], details: { error: null } };
}

const EmptyParams = Type.Object({});

const SearchParams = Type.Object({
  query: Type.String({ description: "What to recall about the user, as a natural-language query." }),
  top_k: Type.Optional(Type.Integer({ description: "Max results (default 5).", minimum: 1, maximum: 50 })),
  memory_types: Type.Optional(
    Type.Array(StringEnum(["episodic_memory", "profile", "raw_message", "agent_memory"] as const), {
      description: "Memory types to search. Default [episodic_memory, profile].",
    }),
  ),
});

const AddParams = Type.Object({
  messages: Type.Array(
    Type.Object({ role: StringEnum(["user", "assistant"] as const), content: Type.String() }),
    { description: "Salient user/assistant messages from this turn, verbatim.", minItems: 1 },
  ),
  session_id: Type.Optional(Type.String({ description: "Optional session id to group related memories." })),
});

const EpisodesParams = Type.Object({
  limit: Type.Optional(Type.Integer({ description: "How many recent episodes (default 10).", minimum: 1, maximum: 100 })),
  days: Type.Optional(Type.Integer({ description: "Only episodes from the last N days.", minimum: 1 })),
});

const ForesightParams = Type.Object({
  query: Type.Optional(Type.String({ description: "Optional focus, e.g. a topic. Defaults to reminders/deadlines." })),
  top_k: Type.Optional(Type.Integer({ description: "Max results (default 10).", minimum: 1, maximum: 50 })),
});

const DeleteParams = Type.Object({
  memcell_id: Type.Optional(
    Type.String({
      description:
        "Delete a single memory: the MemCell id, i.e. the `parent_id` from a memory_search / memory_episodes result (NOT the episode/atomic_fact id).",
    }),
  ),
  session_id: Type.Optional(Type.String({ description: "Batch delete: remove all of this user's memories in a session." })),
  sender_id: Type.Optional(Type.String({ description: "Batch delete: remove this user's memories from a sender." })),
});

const AgentGetParams = Type.Object({
  limit: Type.Optional(Type.Integer({ description: "Max items (default 20).", minimum: 1, maximum: 100 })),
});

const AgentRecordParams = Type.Object({
  messages: Type.Array(
    Type.Object({ role: StringEnum(["user", "assistant"] as const), content: Type.String() }),
    {
      description: "The task trajectory: the request and the agent's approach. Summarize tool steps into assistant messages.",
      minItems: 1,
    },
  ),
  session_id: Type.Optional(Type.String({ description: "Optional session id for this task." })),
});

export function registerMemoryTools(pi: ExtensionAPI): void {
  // --- User memory ---------------------------------------------------------
  pi.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description: "Search the user's long-term memory (EverOS) for relevant past context, preferences, facts, and decisions.",
    promptSnippet: "Recall what you already know about the user before answering when prior context would help.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: SearchParams,
    async execute(_id, params, signal) {
      return jsonResult(
        await searchMemories({
          query: params.query,
          ...(params.top_k !== undefined ? { topK: params.top_k } : {}),
          ...(params.memory_types !== undefined ? { memoryTypes: params.memory_types } : {}),
          ...(signal ? { signal } : {}),
        }),
      );
    },
  });

  pi.registerTool({
    name: "memory_add",
    label: "Memory Add",
    description:
      "Store this turn's salient messages into the user's long-term memory (EverOS). Call only when the turn contains durable, worth-remembering information.",
    promptSnippet: "Persist durable info (preferences, facts, decisions, plans) when a turn is worth remembering.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: AddParams,
    async execute(_id, params, signal) {
      const messages: ChatMessage[] = params.messages.map((m) => ({ role: m.role, content: m.content }));
      return jsonResult(await addMemories(messages, params.session_id, signal ?? undefined));
    },
  });

  pi.registerTool({
    name: "memory_profile",
    label: "Memory Profile",
    description: "Retrieve the consolidated profile EverOS has built for the user (preferences and traits).",
    promptSnippet: "Get a broad sense of who the user is, e.g. for a review or retrospective.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: EmptyParams,
    async execute(_id, _params, signal) {
      return jsonResult(await getProfile(signal ?? undefined));
    },
  });

  pi.registerTool({
    name: "memory_episodes",
    label: "Memory Episodes",
    description: "List the user's recent episodes in reverse-chronological order, for review and retrospectives.",
    promptSnippet: "Chronological recall: what happened recently, optionally bounded to the last N days.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: EpisodesParams,
    async execute(_id, params, signal) {
      return jsonResult(await getEpisodes(params.limit ?? 10, params.days, signal ?? undefined));
    },
  });

  pi.registerTool({
    name: "memory_foresight",
    label: "Memory Foresight",
    description: "Surface the user's active reminders, deadlines, and time-sensitive commitments (foresight memories valid now).",
    promptSnippet: "Surface active reminders and deadlines.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: ForesightParams,
    async execute(_id, params, signal) {
      const query = params.query?.trim() || "reminders deadlines appointments commitments";
      return jsonResult(await searchForesight(query, params.top_k ?? 10, signal ?? undefined));
    },
  });

  pi.registerTool({
    name: "memory_delete",
    label: "Memory Delete",
    description:
      "Permanently forget memories. Single mode: pass memcell_id (the MemCell `parent_id` from a search/episodes result). Batch mode: pass session_id and/or sender_id. Prefer correcting facts via memory_add; use delete only to truly remove information.",
    promptSnippet: "Permanently forget a specific memory (by MemCell parent_id) or a whole session.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: DeleteParams,
    async execute(_id, params, signal) {
      if (!params.memcell_id && !params.session_id && !params.sender_id) {
        throw new Error("Provide memcell_id (single) or session_id/sender_id (batch) to delete.");
      }
      return jsonResult(
        await deleteMemories({
          ...(params.memcell_id ? { memcellId: params.memcell_id } : {}),
          ...(params.session_id ? { sessionId: params.session_id } : {}),
          ...(params.sender_id ? { senderId: params.sender_id } : {}),
          ...(signal ? { signal } : {}),
        }),
      );
    },
  });

  // --- Agent memory --------------------------------------------------------
  pi.registerTool({
    name: "agent_skills",
    label: "Agent Skills",
    description: "Recall reusable skills EverOS has distilled from past agent task trajectories.",
    promptSnippet: "Recall learned, generalized skills before tackling a similar task.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: AgentGetParams,
    async execute(_id, params, signal) {
      return jsonResult(await getAgentSkills(params.limit ?? 20, signal ?? undefined));
    },
  });

  pi.registerTool({
    name: "agent_cases",
    label: "Agent Cases",
    description: "Recall specific past agent cases (task intent, approach, quality score) for similar tasks.",
    promptSnippet: "Recall concrete past approaches to similar tasks.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: AgentGetParams,
    async execute(_id, params, signal) {
      return jsonResult(await getAgentCases(params.limit ?? 20, signal ?? undefined));
    },
  });

  pi.registerTool({
    name: "agent_record",
    label: "Agent Record",
    description:
      "Record a completed task trajectory so EverOS can distill reusable agent_case / agent_skill. Call only after a task worth learning from.",
    promptSnippet: "After a notable completed task, record a concise faithful trajectory to learn from.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    parameters: AgentRecordParams,
    async execute(_id, params, signal) {
      const messages: AgentMessage[] = params.messages.map((m) => ({ role: m.role, content: m.content }));
      return jsonResult(await addAgentMemory(messages, params.session_id, signal ?? undefined));
    },
  });
}
