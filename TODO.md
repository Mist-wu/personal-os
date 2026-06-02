# Personal OS

以「我与 pi agent 的对话」为入口，用 EverOS 做记忆层，让 agent 在持续对话中越来越了解我。

# 构建

- [x] 接入 EverOS 作为记忆层（云端，详见 `docs/everos.md`）
- [x] 纯 TS pi 扩展包（仓库根即包，fetch 直连 REST，9 个工具：`memory_*` + `agent_*`）
- [x] 按 pi package 规范用 `pi install "$PWD"` 全局接入（替代手动软链）
- [ ] AGENTS.md 引导更细分文件，渐进式加载
- [ ] README.md 使用方法（中英文）

# 工作流

- 入口是「我与 pi agent 的对话」，通过持续对话让 agent 越来越了解我
- agent 自行判断：需要历史上下文时 `memory_search`，值得长期记住时 `memory_add`，
  纠正用 `memory_add`（EverOS 自动消解矛盾），真要抹除才 `memory_delete`；
  另有 `memory_profile` / `memory_episodes` / `memory_foresight` 和 `agent_*` 系列
- 记忆与画像由 EverOS 维护，按意图重建上下文
- 给出规划、建议、Brainstorm

## 可扮演角色

- 研究员：搜集资料、归纳对比
- 助教：解释概念、出题、检查理解
- 程序员助手：写样板代码、补测试、查 bug
- 秘书：整理会议纪要、待办、日程
- 编辑：改表达、补结构、提标题
- 复盘教练：分析时间使用和行动质量

# 设计原则

- 单用户、个人使用，`user_id` 固定 `wu`
- 记忆存储交给 EverOS，不再维护 Markdown 知识库
- 人定方向、做关键决策与审核；AI 负责检索、总结、草稿、初步分析
