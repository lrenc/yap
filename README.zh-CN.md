<div align="center">
  <img src="./assets/logo.svg" width="78" alt="YAP logo" />

  <h1>YAP</h1>

  <p><strong>本地优先的终端 AI Agent Harness。</strong></p>

  <p>
    <img alt="Early development" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22%2B-5FA04E?style=flat-square&logo=node.js&logoColor=white" />
    <a href="https://www.npmjs.com/package/@lrenc/yap"><img alt="npm version" src="https://img.shields.io/npm/v/@lrenc/yap?style=flat-square" /></a>
  </p>

  <p><a href="./README.md">English</a></p>
</div>

---

YAP 是一个本地优先、面向终端的 AI Agent Harness。终端是主要交互界面，项目的核心则是可中断的 Agent 运行时，涵盖流式模型输出、参数经过校验的工具调用、重复调用保护、消息排队和上下文预算管理。

除运行时外，YAP 还提供可复用的 Prompt、按模型配置的推理强度，以及本地模型与凭据管理。它的设计目标是覆盖现代 Agent Harness 的关键能力，包括明确的工具执行边界、可复现的运行配置、可恢复的会话、带审批的操作，以及可扩展的集成机制。

## 功能

已支持的能力标记为勾选；未勾选项是后续计划实现的能力。

- [x] **可中断的任务执行** — 支持取消运行中的任务，也支持排队发送后续消息。
- [x] **工具调用循环** — 执行参数校验后的工具，并识别持续重复且没有进展的调用。
- [x] **上下文管理** — 控制 token 预算，并压缩过长的对话。
- [x] **可复用 Prompt** — 创建、管理和切换本地 Markdown Prompt。
- [x] **多模型支持** — 支持 DeepSeek 和智谱 GLM，并可分别配置推理强度。
- [x] **本地优先配置** — 设置、Prompt 和凭据默认保存在本机。
- [x] **结构化运行事件** — 展示模型响应、工具调用、上下文压缩和最终状态。
- [x] **终端对话记录** — 以流式方式显示 Markdown，并可回看较早的输出。
- [ ] **安全工作区操作** — 在审批控制下提供文件读写、Shell 执行和恢复能力。
- [ ] **持久化会话** — 保存并恢复对话、运行状态和检查点。
- [ ] **项目上下文** — 加载项目规则，并检索与当前任务相关的仓库内容。
- [ ] **可扩展集成** — 支持 MCP、生命周期钩子、插件、Skills 和自定义工具。
- [ ] **并行 Agent** — 运行相互隔离的子 Agent，并协调共享任务。
- [ ] **评估与回放** — 记录、回放和基准测试 Agent 的运行过程。

## 快速开始

需要 Node.js 22 或更高版本。

YAP 必须在交互式终端中运行，重定向的输入和输出会被拒绝。

```bash
npm install -g @lrenc/yap
yap
```

也可以不全局安装，直接运行：

```bash
npx @lrenc/yap
```

首次使用时：

1. 输入 `/model`，选择 DeepSeek 或 GLM 模型。
2. 输入 `/config`。
3. 选择 `API Key`，保存当前模型对应提供商的 API Key。
4. 开始输入消息。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/config` | 管理 API Key 和推理强度。 |
| `/model [id]` | 打开模型选择器，或直接指定模型。 |
| `/prompt [name\|default]` | 管理 Prompt，或直接切换到指定 Prompt。 |
| `/new` | 开始新对话。 |

输入 `/` 可打开命令面板。

## 运行与交互

输入消息后按 Enter 发送；按 Shift+Enter 或 Alt+Enter 换行。运行期间可以继续输入后续消息，这些消息会加入当前对话。按 Escape 会取消正在运行和排队中的 Agent 任务，但不会退出 YAP；按 Ctrl+C 退出。

YAP 会渲染助手输出的 Markdown，包括标题、列表、引用、表格、目录树、代码块和行内格式。对话记录还会显示流式响应、工具活动、上下文压缩和错误信息。可以使用鼠标滚轮或 Page Up/Page Down 查看较早的内容；滚动后，新输出不会自动把视图拉回底部。使用 `/new` 可清空当前对话上下文。

YAP 使用终端的备用屏幕显示对话记录。退出后会恢复终端原先的内容。

## 模型

当前支持以下模型：

- DeepSeek Flash（`deepseek-flash`）
- DeepSeek Pro（`deepseek-v4-pro`）
- GLM-5.3（`glm-5.3`）

可以使用 `/model <id>` 直接选择模型，或运行不带参数的 `/model` 打开模型选择器。

## Prompt

Prompt 以纯 Markdown 文件保存，可通过 `/prompt` 创建、编辑、选择或删除。名称最多 16 个字符，必须是安全的文件名，且不能使用保留名称 `default`。选择 `default` 会恢复内置的系统 Prompt。

## 配置与数据

YAP 默认将本地数据保存在 `~/.yap`：

```text
~/.yap/
├── config.json
├── secrets.json
└── prompts/
    └── <name>.md
```

- `config.json` 保存当前模型、推理强度和选中的 Prompt。
- `secrets.json` 保存模型提供商的 API Key。
- `prompts/` 保存用户创建的 Prompt 文件。

YAP 会先完整写入配置文件，再进行替换；在平台支持时，这些文件仅当前用户可访问。API Key 以明文 JSON 保存，不使用操作系统密钥链，因此请妥善保护 `~/.yap` 的内容。

YAP 的设置和 Prompt 保存在本地。处理请求时，对话消息、工具结果和相关文件内容可能会发送给已配置的模型提供商。

## 开发

源码开发需要 [Bun](https://bun.sh/) 1.4 或更高版本。发布后的 CLI 运行于 Node.js，用户无需安装 Bun。

```bash
git clone https://github.com/lrenc/yap.git
cd yap
bun install
bun run start
```

构建兼容 Node.js 的 CLI：

```bash
bun run build
node dist/cli.js
```

质量检查：

```bash
bun run typecheck
bun test
```

运行覆盖率测试：

```bash
bun run test:coverage
```

### 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/cli/` | 终端客户端、输入处理和 Markdown 渲染 |
| `src/app/` | Harness 输入流程、终端命令和 Agent 生命周期编排 |
| `src/agent/` | Agent 配置与能力、Session/Run 生命周期、模型目录和本地设置 |
| `src/context/` | 对话历史、token 估算和上下文压缩 |
| `src/model/` | Responses 协议类型、HTTP/SSE 客户端和提供商适配层 |
| `src/tools/` | 内置文件工具和工具定义 |
| `scripts/` | 构建和发布辅助脚本 |
