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

YAP 是一个本地优先的 AI Agent Harness，以终端作为主要交互界面。项目的核心
是可中断的 Agent 运行时，包括流式模型轮次、类型化工具调用、执行护栏、输入
排队，以及有边界的上下文管理。

在运行时之外，YAP 还提供可复用的 Prompt、按模型配置的推理强度，以及本地模型
与凭据管理。它以现代 harness 所需的能力为设计方向：明确的执行边界、可复现
的配置、可恢复的会话、权限感知的操作，以及可持续扩展的集成能力。

## 功能

已支持的能力标记为勾选；未勾选项是后续计划实现的能力。

- [x] **可中断的 Agent 执行** — 提供流式模型轮次、可取消请求和后续消息排队。
- [x] **感知工具的 Agent 循环** — 类型化工具契约、参数校验、结构化结果、
  中断传播，以及重复调用无进展检测。
- [x] **有边界的上下文管理** — 本地 token 估算、预算检查和基于摘要的上下文
  压缩，支持长时间的持续工作。
- [x] **可复用的 Prompt 系统** — 创建、编辑、选择和删除本地 Markdown Prompt，
  并提供内置默认 Prompt。
- [x] **模型与提供商抽象** — 通过提供商感知的 Responses 协议接入 DeepSeek 和
  智谱 GLM，并支持按模型配置推理强度。
- [x] **本地优先的配置** — 原子写入设置；在平台支持时应用私有文件权限；本地
  保存 Prompt 与凭据。
- [x] **可检查的运行事件** — 以结构化事件暴露模型轮次、工具活动、上下文压缩、
  中断和最终停止状态。
- [x] **终端原生对话记录** — 在终端内查看流式 Markdown、表格、目录树、代码块，
  并滚动浏览历史输出。
- [ ] **权限感知的工作区操作** — 提供受作用域限制的读取、写入和 Shell 工具，
  以及审批策略、进程隔离、超时和恢复机制。
- [ ] **持久化会话** — 保存对话、工具状态和检查点，并支持恢复或分支被中断的
  任务。
- [ ] **项目感知的上下文** — 加载项目规则、索引代码库，并在上下文预算内检索
  相关代码或历史记录。
- [ ] **可扩展的集成能力** — 支持 MCP 服务、hooks、插件、skills 和用户自定义
  工具，并提供稳定的生命周期契约。
- [ ] **并行多 Agent 执行** — 支持隔离的子 Agent、共享任务协调，以及工作区或
  worktree 编排。
- [ ] **评估与回放** — 提供结构化 trace、确定性回放、基准任务，以及针对
  harness 行为的失败分析。

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

首次运行时：

1. 输入 `/model`，选择 DeepSeek 或 GLM 模型。
2. 输入 `/config`。
3. 选择 `API Key` 并保存当前模型所属提供商的 API Key。
4. 开始输入消息。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/config` | 管理 API Key 和推理强度。 |
| `/model [id]` | 打开模型选择器，或直接选择一个模型。 |
| `/prompt [name\|default]` | 管理 Prompt，或直接选择一个 Prompt。 |
| `/new` | 开始新对话。 |

输入 `/` 可打开命令面板。

## 运行与交互

输入消息后按 Enter 发送。使用 Shift+Enter 或 Alt+Enter 换行。运行过程中也可以
继续输入后续消息，这些消息会进入当前对话。按 Escape 会取消排队中和正在运行的
Agent 任务，但不会退出 YAP。按 Ctrl+C 退出。

对话记录支持 Assistant Markdown 渲染，包括标题、列表、引用、表格、目录树、
代码块和行内格式。记录中还会显示流式响应、工具活动、上下文压缩和错误。可以
使用鼠标滚轮或 Page Up/Page Down 查看较早的输出。滚动后，新输出不会强制将
视图拉回底部。使用 `/new` 可清空当前对话上下文。

YAP 使用终端的备用屏幕显示对话记录。退出后会恢复终端原先的内容。

## 模型

当前支持的模型：

- DeepSeek Flash（`deepseek-flash`）
- DeepSeek Pro（`deepseek-v4-pro`）
- GLM-5.3（`glm-5.3`）

可以使用 `/model <id>` 直接选择模型，或运行不带参数的 `/model` 打开模型选择器。

## Prompt

Prompt 以纯 Markdown 文件保存，可以通过 `/prompt` 创建、编辑、选择或删除。
名称最多 16 个字符，必须是安全的文件名，并且不能使用保留名称 `default`。
选择 `default` 会恢复内置系统 Prompt。

## 配置与数据

默认情况下，YAP 将本地数据保存在 `~/.yap`：

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

在平台支持时，设置文件会以原子方式写入，并应用私有文件权限。API Key 以明文
JSON 保存，不使用操作系统密钥链，因此请妥善保护 `~/.yap` 的内容。

YAP 的设置和 Prompt 保存在本地。处理请求时，对话消息、工具结果和相关文件内容
可能会发送给配置的模型服务提供商。

## 开发

源码开发需要 [Bun](https://bun.sh/) 1.4 或更高版本。发布后的 CLI 使用
Node.js 运行，不要求用户安装 Bun。

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
| `src/app/` | Harness 编排、命令、模型和本地设置 |
| `src/agent/` | Agent 运行时、会话、模型与工具循环、流式处理和护栏 |
| `src/context/` | 对话历史、token 估算和上下文压缩 |
| `src/model/` | 提供商配置、Responses 客户端和协议适配层 |
| `src/tools/` | 内置文件工具和工具定义 |
| `scripts/` | 构建和发布辅助脚本 |
