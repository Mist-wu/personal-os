# EverOS — pi-everos-memory 的记忆层

EverOS 是给 AI agent 用的「记忆操作系统」：把对话自动抽取成结构化记忆（MemCell → MemScene），
自动消解矛盾、维护用户画像，并在需要时按意图重建上下文。

完整 API 参考：https://docs.evermind.ai/llms-full.txt （动手前先读）
控制台 / API Key：https://everos.evermind.ai

## 在 pi-everos-memory 中的定位

- **入口是「我与 pi agent 的对话」**：不再依赖 `inbox.md`，通过持续对话让 agent 越来越了解我。
- **EverOS 直接作为存储**：长期记忆与用户画像落在 EverOS，而不是 Markdown 知识库。
- **封装成一个 pi extension**：注册原生 `memory_*` / `agent_*` 工具，agent 在对话中随时调用。
- **是否记入由 agent 判断**：不每轮强制写入，由 agent 判断「这轮值得记」时才调用 `memory_add`。
- **云端托管**：用 EverOS 云端服务，配置 API Key 即可，不自建基础设施（纯 TS、无 Python 依赖）。
- **个人使用**：单用户，`user_id` 固定为 `wu`，采用 `assistant` 场景模式（episode / profile / foresight / eventlog 四类记忆）。

> 场景模式一旦写入数据即不可更改，个人单用户固定为 `assistant`。

## 配置

密钥从本地 `.env` 读取，**不提交版本库**（`.env` 已在 `.gitignore`）：

```
EVEROS_API_KEY="<your_key>"
```

extension 会优先读环境变量 `EVEROS_API_KEY`，否则从自身位置向上查找含该键的 `.env`
（即便经 pi package 从别处加载也能找到仓库根的 `.env`）。base URL 默认 `https://api.evermind.ai`，
可用 `EVEROS_BASE_URL` 覆盖。

## extension：pi-everos-memory（已实现）

参考 [pi-codex-goal](https://github.com/fitchmultz/pi-codex-goal) 的范式，做成一个**纯 TypeScript 的 pi 扩展包**，
扩展包即本仓库根目录（package.json 在根）：

```
.（仓库根 = pi-everos-memory）
├── package.json      # pi.extensions manifest + optional peerDeps（pi 运行时自带）
├── tsconfig.json
├── src/
│   ├── index.ts      # 入口：注册工具
│   ├── tools.ts      # memory_* + agent_* 共 9 个工具
│   ├── everos.ts     # fetch 直连 EverOS REST API（search / get / add+flush / agent add+flush / delete）
│   ├── config.ts     # USER_ID=wu、method、base URL、loadApiKey()
│   └── prompts.ts    # 工具使用准则
├── test/             # node --import tsx --test
└── README.md / AGENTS.md / LICENSE / docs/
```

**纯 TS、零 Python**：直接用 `fetch` 调云端 REST API（`https://api.evermind.ai`），
不再绕 Python/venv。pi 运行时自带 `@earendil-works/pi-coding-agent`、`typebox`，加载它无需 `npm install`。

注册给 LLM 的工具（9 个）：

**User 记忆**
1. **`memory_search`**：默认 `hybrid` 检索（`top_k=5`），返回命中的 episode/profile；可选 `method`（keyword/vector/hybrid/agentic）、`radius`、`include_original_data`。
2. **`memory_add`**：写入 user/assistant 消息并 `flush`；可选 `attachments`（本地文件路径，经 `/object/sign` + S3 直传为多模态附件）。**由 agent 判断是否调用**。
3. **`memory_profile`**：取回用户画像（`memory_type="profile"`）。
4. **`memory_episodes`**：按时间倒序读近期 episode（`limit` / `days`），用于回顾/复盘。
5. **`memory_foresight`**：检索提醒/deadline 等时间敏感项。
6. **`memory_delete`**：永久删除。单条传 **MemCell id**（即 search/episodes 结果里的 `parent_id`，不是 episode/atomic_fact id）；批量传 `session_id` / `sender_id`。无需二次确认，返回 204。

**Agent 记忆**
7. **`agent_skills`**：取回蒸馏出的可复用技能（`agent_skill`）。
8. **`agent_cases`**：取回过往任务案例（`agent_case`）。
9. **`agent_record`**：完成值得沉淀的任务后，写入精简轨迹（`/memories/agent` + flush）；支持真实 `tool_calls` / `tool` 步骤（OpenAI 格式），也可摘要成 assistant 消息。**由 agent 判断是否调用**。

固定参数：`user_id="wu"`、`method="hybrid"`、`scenario=assistant`。

> **纠正优先用 `memory_add`，删除用 `memory_delete`**：更正一条事实时，直接 `memory_add` 更正说法，
> EverOS 会自动消解矛盾、顶替旧 profile 条目；只有要真正抹掉数据时才用 `memory_delete`。
> 删除的关键是用 **MemCell id**（search 结果的 `parent_id`）——这是之前误判"删除无效"的根因
> （当时传的是 episode/atomic_fact id）。删除对权威存储（`/memories/get`，即 `memory_episodes`）
> 立即生效，但 `search` 索引是最终一致，删后短时间内可能仍返回该条（summary 已被清空）。

> 注意（文档超前于云端 API）：官方文档（含开源 v1.0.0 的 "Foresight Memory" 一节）已把
> `foresight`、`eventlog` 列为记忆类型，但云端 search/get **实测仍拒绝**这两类
> （2026-06-04 实测 422：search 合法类型仅 `agent_memory / episodic_memory / profile / raw_message`；
> get 仅 `agent_case / agent_skill / episodic_memory / profile`）。
> 因此 `memory_foresight` 仍在 episodic+profile 上做"提醒/deadline"语义检索并带 `current_time`；
> 待云端放开 `foresight` 后，可直接切到 `memory_types:["foresight"]`。

### 已接入与未接入的 API

近期已补接（贴合 EverOS 云端 SDK v0.4.1 + 最新 API 文档）：

- **多模态上传**（`/object/sign` + S3 直传）：`memory_add` 的 `attachments` 传本地文件路径，
  自动签名上传并作为 `ContentItem` 关联到最近一条 user 消息（image/pdf/doc/txt/html/eml/mp3/wav）。
- **检索增强**：`memory_search` 透出 `method`（keyword/vector/hybrid/agentic）、`radius`、`include_original_data`。
- **真实工具轨迹**：`agent_record` 支持 `tool_calls` / `tool` 步骤（OpenAI 格式）。

仍未接入（按需再加）：群组/多人记忆（group、Groups、Senders）、异步任务状态（`/tasks`）、
设置（`/settings`）、附件下载/大文件 S3 引用。个人单用户场景暂不需要。

## 全局启用

已发布到 npm（[`pi-everos-memory`](https://www.npmjs.com/package/pi-everos-memory)），按 pi package 规范
（[packages.md](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/packages.md)）安装：

```bash
pi install npm:pi-everos-memory   # 推荐，写入用户级 ~/.pi/agent/settings.json
pi install "$PWD"                 # 本地开发：只把仓库路径写进 settings，不复制
```

`pi list` 查看已装包，`pi remove <source>` 卸载，`pi config` 启用/禁用单项资源。
manifest 在 `package.json` 的 `pi.extensions` 字段，`pi-package` keyword 用于发现。
发版流程见 [`RELEASING.md`](RELEASING.md)。

> 可选增强：在 `before_agent_start` 事件里自动 `memory_search` 并把画像/相关记忆注入系统提示，
> 实现「无需 agent 主动调用」的自动检索。记录仍保持由 agent 判断。
