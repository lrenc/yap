<div align="center">
  <img src="./assets/logo.svg" width="78" alt="YAP logo" />

  <h1>YAP</h1>

  <p><strong>专注的终端 AI 助手。</strong></p>

  <p>
    <img alt="Early development" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Bun" src="https://img.shields.io/badge/runtime-Bun-000000?style=flat-square&logo=bun&logoColor=white" />
  </p>

  <p><a href="./README.md">English</a></p>
</div>

---

YAP 是一款本地优先的终端 AI 编程助手，提供可中断的 Agent 运行时、可复用
Prompt，以及简洁的模型和凭据管理。

> [!NOTE]
> YAP 仍处于早期开发阶段，会话持久化和独立打包尚未完成。

## 功能

- 可中断的流式对话，并支持排队发送后续消息。
- 适合终端显示的 Markdown、表格、目录树和代码块。
- 为长对话提供上下文压缩和 token 预算管理。
- 本地 Prompt 管理，以及可配置的模型推理强度。
- 内置文件和目录读取工具。

## 快速开始

需要 [Bun](https://bun.sh/) 1.4 或更高版本，以及 DeepSeek API Key。
YAP 必须在交互式终端中运行，重定向的输入和输出会被拒绝。

```bash
git clone https://github.com/lrenc/yap.git
cd yap
bun install
bun run start
```

首次运行时：

1. 输入 `/config`。
2. 选择 `API Key` 并保存 DeepSeek API Key。
3. 如需选择模型，输入 `/model`。
4. 开始输入消息。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/config` | 管理 API Key 和推理强度。 |
| `/model [id]` | 打开模型选择器，或直接选择一个模型。 |
| `/prompt [name\|default]` | 管理 Prompt，或直接选择一个 Prompt。 |
| `/new` | 开始新对话。 |

输入 `/` 可打开命令面板。

## 对话

输入消息后按 Enter 发送。使用 Shift+Enter 或 Alt+Enter 换行。运行过程中也可以
继续输入后续消息；按 Escape 会取消排队中和正在运行的对话任务，但不会退出
YAP。按 Ctrl+C 退出。

对话记录支持 Assistant Markdown 渲染，包括标题、列表、引用、表格、目录树、
代码块和行内格式。记录中还会显示流式响应、工具活动、上下文压缩和错误。可以
使用鼠标滚轮或 Page Up/Page Down 查看较早的输出。滚动后，新输出不会强制将
视图拉回底部。使用 `/new` 可清空当前对话上下文。

YAP 使用终端的备用屏幕显示对话记录。退出后会恢复终端原先的内容。

## 模型

使用 `/model` 选择当前模型。每个模型都有自己的默认值和支持的推理设置。使用
`/config` 查看或修改当前模型的推理强度。

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
| `src/cli/` | Ink 终端 UI、输入处理和 Markdown 渲染 |
| `src/app/` | 应用状态、命令、模型和本地设置 |
| `src/agent/` | Session、Run、流式处理和工具执行 |
| `src/context/` | 对话历史、token 估算和上下文压缩 |
| `src/model/` | 模型提供商以及 HTTP/SSE 客户端 |
| `src/tools/` | 内置文件工具和工具定义 |

### 路线图

- [ ] 虚拟化对话记录，并使用稳定的消息 key 和行偏移保留用户调整窗口大小后的
  阅读位置。窗口宽度变化时重新计算自动换行后的高度，不要使用 DOM 子节点索引
  作为锚点。
