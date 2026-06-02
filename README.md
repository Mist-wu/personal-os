<div align="center">

# 🧠 pi-everos-memory

**给 [pi](https://github.com/earendil-works/pi) coding agent 的 EverOS 长期记忆层**

让 agent 在持续对话中真正「记住你」——跨会话留存偏好、事实、决策与任务经验。

<br/>

[![npm](https://img.shields.io/npm/v/pi-everos-memory?style=flat-square&logo=npm)](https://www.npmjs.com/package/pi-everos-memory)
![pi](https://img.shields.io/badge/pi-extension-2563eb)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![EverOS](https://img.shields.io/badge/memory-EverOS-7c3aed)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.19-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-22c55e)

</div>

---

一个**纯 TypeScript** 的 pi 扩展包：通过 `fetch` 直连 [EverOS](https://everos.evermind.ai) REST API，
向 agent 注册 **9 个模型可调用工具**，无 Python、无额外运行时。以「我与 pi agent 的对话」为入口，
让 agent 越来越了解我（`user_id = wu`），胜任研究员、助教、程序员助手、秘书、编辑、复盘教练等角色。

## ✨ 特性

- **持久记忆** — 偏好、事实、决策、任务轨迹由 EverOS 跨会话留存，按意图重建上下文。
- **自动消解矛盾** — 信息更新时由 EverOS 自动顶替旧画像，无需手动维护。
- **Agent 自判断** — 由模型决定「这轮值得记」才写入，不污染记忆。
- **零依赖加载** — pi 运行时自带核心包，装上即用，无需 `npm install`。
- **单文件即包** — 仓库根即 pi package，`pi install "$PWD"` 一键全局接入。

## 🧰 工具

**User 记忆**

| 工具 | 说明 |
| --- | --- |
| `memory_search` | 检索相关历史上下文、偏好、事实、决策 |
| `memory_add` | 把本轮值得长期记住的关键消息写入记忆 |
| `memory_profile` | 取回 EverOS 沉淀的用户画像 |
| `memory_episodes` | 按时间倒序列出近期 episode（回顾 / 复盘） |
| `memory_foresight` | 浮现提醒、deadline 等时间敏感项 |
| `memory_delete` | 永久删除：按 MemCell `parent_id` 删单条，或按 `session_id` 删整段 |

**Agent 记忆**

| 工具 | 说明 |
| --- | --- |
| `agent_skills` | 取回从过往任务轨迹蒸馏出的可复用技能 |
| `agent_cases` | 取回相似任务的具体过往做法 |
| `agent_record` | 记录一段值得学习的已完成任务轨迹 |

> [!NOTE]
> **写入由 agent 判断**（`memory_add` / `agent_record`），不每轮强制写入。

> [!TIP]
> **纠正事实**优先用 `memory_add` 写更正说法 —— EverOS 自动消解矛盾、顶替旧画像；
> 只有要真正抹除数据时才用 `memory_delete`。单条删除传 **MemCell id**
> （`memory_search` / `memory_episodes` 结果里的 `parent_id`，**不是** episode / atomic_fact id），返回 `204`。
> 删除对权威存储（`memory_episodes`）立即生效，但 `search` 索引最终一致、删后可能短暂仍返回该条。

## ⚙️ 工作原理

```
pi agent ──tool call──▶ pi-everos-memory ──fetch/HTTPS──▶ EverOS REST API
   ▲                                                            │
   └──────────────── 画像 / episode / 技能 ◀────────────────────┘
```

工具用 `fetch` 直连 EverOS REST API（`https://api.evermind.ai`）。固定参数：单用户 `wu`、`hybrid`
检索、`assistant` 场景模式。pi 运行时自带 `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`、`typebox`。

## 🚀 快速开始

**1. 配置 API Key** — 在 <https://everos.evermind.ai> 申请，写入仓库根 `.env`（已被 `.gitignore`，不提交）：

```bash
echo 'EVEROS_API_KEY="<your_key>"' > .env
```

> 扩展会优先读环境变量 `EVEROS_API_KEY`，否则从自身位置向上查找含该键的 `.env`。

**2. 安装为 pi package**

```bash
pi install npm:pi-everos-memory              # 推荐：从 npm 安装（用户级）
# pi install npm:pi-everos-memory@0.1.0    # 固定版本
# pi install -l npm:pi-everos-memory       # 项目级 .pi/settings.json
```

本地开发（源码留在仓库，`pi install` 只写入 settings、不复制）：

```bash
pi install "$PWD"
# 或 pi install -l "$PWD"
```

> `pi list` 查看已装包 · `pi remove <source>` 卸载 · `pi config` 启用/禁用单项资源。
> 版本记录见 [Releases](https://github.com/Mist-wu/pi-everos-memory/releases) · [pi package 规范](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/packages.md)。

**3. 开聊** — 启动 pi 正常对话即可，agent 会按需 `memory_search` / `memory_add`。

## 🔧 配置

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `EVEROS_API_KEY` | （从 `.env` 读取） | EverOS 鉴权 |
| `EVEROS_BASE_URL` | `https://api.evermind.ai` | API base URL |

## 🛠 开发

```bash
npm install        # 仅 typecheck / 测试需要
npm run verify     # typecheck + 测试
```

## 📚 文档

| 文件 | 内容 |
| --- | --- |
| [`docs/everos.md`](docs/everos.md) | EverOS 记忆层设计、工具说明、配置与接入 |
| [`docs/RELEASING.md`](docs/RELEASING.md) | npm 与 GitHub Release 发版流程 |
| [`AGENTS.md`](AGENTS.md) | 模块地图与约定 |
| [`TODO.md`](TODO.md) | 路线图与设计原则 |

## 🧭 设计原则

- 单用户、个人使用，`user_id` 固定 `wu`。
- 记忆存储交给 EverOS，不维护 Markdown 知识库。
- 人定方向、做关键决策与审核；AI 负责检索、总结、草稿、初步分析。

## 💬 交流

Pull Request · Issue · WeChat `qbsdw0616`

## 📄 License

[MIT](LICENSE) © Mist-wu
