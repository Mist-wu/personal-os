<p align="center">
    <h1 align="center">pi-everos-memory</h1>
    <p align="center">
        给 <a href="https://github.com/earendil-works/pi">pi</a> agent 的 EverOS 长期记忆层<br/>
        EverOS-backed long-term memory for the pi coding agent
    </p>
</p>

把「我与 pi agent 的对话」当入口，用 [EverOS](https://everos.evermind.ai) 做长期记忆层，
让 agent 在持续对话中越来越了解我（`user_id = wu`），并扮演研究员、助教、程序员助手、秘书、编辑、复盘教练等角色。

纯 TypeScript 的 pi 扩展包：通过 `fetch` 直连 EverOS REST API，注册 9 个模型可调用工具，无 Python、无额外运行时。

## 工具一览

**User 记忆**

- `memory_search` — 检索相关历史上下文、偏好、事实、决策。
- `memory_add` — 把本轮值得长期记住的关键消息写入记忆。
- `memory_profile` — 取回 EverOS 沉淀的用户画像。
- `memory_episodes` — 按时间倒序列出近期 episode（回顾/复盘）。
- `memory_foresight` — 浮现提醒、deadline 等时间敏感项。
- `memory_delete` — 永久删除：按 MemCell `parent_id` 删单条，或按 `session_id` 删整段。

**Agent 记忆**

- `agent_skills` — 取回从过往任务轨迹蒸馏出的可复用技能。
- `agent_cases` — 取回相似任务的具体过往做法。
- `agent_record` — 记录一段值得学习的已完成任务轨迹。

> 是否记入由 agent 判断（`memory_add` / `agent_record`），不每轮强制写入。
>
> **纠正事实**优先 `memory_add` 更正说法——EverOS 自动消解矛盾、顶替旧画像条目；
> 只有要真正抹除数据时才用 `memory_delete`。`memory_delete` 单条传 **MemCell id**
> （search/episodes 结果里的 `parent_id`，不是 episode/atomic_fact id），返回 204；
> 删除对权威存储（`memory_episodes`）立即生效，但 `search` 索引最终一致、删后可能短暂仍返回该条。
>
> 注意：当前 EverOS API 的 search/get 无独立 `foresight` 类型，故 `memory_foresight` 实为
> 在 episodic+profile 上做"提醒/deadline"语义检索并带 `current_time`。

## 工作原理

工具用 `fetch` 直连 EverOS REST API（`https://api.evermind.ai`）。固定参数：单用户 `wu`、
`hybrid` 检索、`assistant` 场景模式。pi 运行时自带 `@earendil-works/pi-coding-agent`、
`@earendil-works/pi-ai`、`typebox`，加载它无需 `npm install`。

## 快速开始

1. 在 <https://everos.evermind.ai> 申请 API Key，写入仓库根 `.env`（已被 `.gitignore`，不提交）：

   ```
   EVEROS_API_KEY="<your_key>"
   ```

   扩展会优先读环境变量 `EVEROS_API_KEY`，否则从自身位置向上查找含该键的 `.env`。

2. 按 [pi package 规范](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/packages.md)以「本地路径源」安装（源码留在仓库，`pi install` 只写入 settings、不复制）：

   ```bash
   pi install "$PWD"          # 用户级 ~/.pi/agent/settings.json，全机生效
   # 或 pi install -l "$PWD"  # 项目级 .pi/settings.json，随仓库共享
   ```

   `pi list` 查看已装包，`pi remove <source>` 卸载，`pi config` 启用/禁用单项资源。

3. 启动 pi，正常对话即可——agent 会按需 `memory_search` / `memory_add`。

## 开发

```bash
npm install        # 仅 typecheck/测试需要
npm run verify     # typecheck + 测试
```

## 配置

| 环境变量          | 默认值                      | 用途           |
| ----------------- | --------------------------- | -------------- |
| `EVEROS_API_KEY`  | （从 `.env` 读取）          | EverOS 鉴权    |
| `EVEROS_BASE_URL` | `https://api.evermind.ai`   | API base URL   |

## 文档

- [`docs/everos.md`](docs/everos.md)：EverOS 记忆层设计、工具说明、配置与接入。
- [`AGENTS.md`](AGENTS.md)：模块地图与约定。
- [`TODO.md`](TODO.md)：路线图与设计原则。

## 设计原则

- 单用户、个人使用，`user_id` 固定 `wu`。
- 记忆存储交给 EverOS，不维护 Markdown 知识库。
- 人定方向、做关键决策与审核；AI 负责检索、总结、草稿、初步分析。

## 交流

- Pull Request · Issue · Wechat: qbsdw0616
