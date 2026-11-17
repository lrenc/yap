<div align="center">
  <img src="./assets/logo.svg" width="78" alt="YAP logo" />

  <h1>YAP</h1>

  <p><strong>A focused terminal AI assistant.</strong></p>

  <p>
    <img alt="Early development" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22%2B-5FA04E?style=flat-square&logo=node.js&logoColor=white" />
    <a href="https://www.npmjs.com/package/@lrenc/yap"><img alt="npm version" src="https://img.shields.io/npm/v/@lrenc/yap?style=flat-square" /></a>
  </p>

  <p><a href="./README.zh-CN.md">简体中文</a></p>
</div>

---

YAP is a local-first AI coding assistant for the terminal. It provides an
interruptible agent runtime, reusable prompts, and simple controls for models
and credentials.

> [!NOTE]
> YAP is still in early development. Session persistence and standalone
> packaging are not complete.

## Features

- Interruptible, streamed conversations with queued follow-up messages.
- Terminal-friendly Markdown, tables, directory trees, and code blocks.
- Context compaction and token budgeting for long conversations.
- Local Prompt management and configurable model reasoning effort.
- Built-in tools for reading files and directories.

## Quick Start

You need [Node.js](https://nodejs.org/) 22 or newer and an API key for
DeepSeek or [Zhipu GLM](https://docs.bigmodel.cn/cn/guide/develop/responses/introduction).
Run YAP in an interactive terminal; redirected input and output are rejected.
The package is available on [npm](https://www.npmjs.com/package/@lrenc/yap).

```bash
npm install -g @lrenc/yap
yap
```

You can also run it without a global install:

```bash
npx @lrenc/yap
```

On the first run:

1. Enter `/model` and choose a DeepSeek or GLM model.
2. Enter `/config`.
3. Select `API Key` and save the key for the selected provider.
4. Start typing a message.

## Commands

| Command | Description |
| --- | --- |
| `/config` | Manage the API key and reasoning effort. |
| `/model [id]` | Open the model picker or select a model directly. |
| `/prompt [name\|default]` | Manage prompts or select one directly. |
| `/new` | Start a new conversation. |

Type `/` to open the command palette.

## Conversation

Type a message and press Enter to send it. Use Shift+Enter or Alt+Enter for a
new line. Follow-up messages can be entered while a run is active; Escape
cancels queued and running conversation work without exiting YAP. Ctrl+C exits.

The transcript renders assistant Markdown, including headings, lists, quotes,
tables, directory trees, code blocks, and inline formatting. It also shows
streamed responses, tool activity, compaction, and errors. Use the mouse wheel
or Page Up/Page Down to review earlier output. New output continues to follow
the bottom until you scroll away. Use `/new` to start a fresh conversation
context.

YAP uses the terminal's alternate screen for its transcript. Exiting restores
the previous terminal contents; use the transcript while YAP is open.

## Models

Use `/model` to choose the active model. Each model provides its own defaults
and supported reasoning settings. Use `/config` to review or change the active
model's reasoning effort.

DeepSeek models use the OpenAI Responses protocol directly. GLM uses the
Responses adapter and the `https://open.bigmodel.cn/api/v1` endpoint. A standard
BigModel API key is required; GLM Coding Plan keys are currently limited to the
Chat Completions protocol by Zhipu.

## Prompts

Prompts are plain Markdown files and can be created, edited, selected, or
deleted with `/prompt`. Names are limited to 16 characters, must be safe file
names, and cannot use the reserved name `default`. Selecting `default` restores
the built-in system Prompt.

## Configuration and Data

YAP stores local data under `~/.yap` by default:

```text
~/.yap/
├── config.json
├── secrets.json
└── prompts/
    └── <name>.md
```

- `config.json` contains the active model, reasoning effort, and selected
  Prompt.
- `secrets.json` contains provider API keys.
- `prompts/` contains user-created Prompt files.

Settings files are written atomically with private file permissions where the
platform supports them. API keys are stored as plaintext JSON rather than in an
OS keychain, so protect the contents of `~/.yap`.

YAP's settings and Prompts stay on the local machine. Conversation messages,
tool results, and relevant file contents may be sent to the configured model
provider when needed to process a request.

## Development

Source development requires [Bun](https://bun.sh/) 1.4 or newer. The published
CLI runs on Node.js and does not require Bun.

```bash
git clone https://github.com/lrenc/yap.git
cd yap
bun install
bun run start
```

Build the Node-compatible CLI:

```bash
bun run build
node dist/cli.js
```

Quality checks:

```bash
bun run typecheck
bun test
```

For coverage, run `bun run test:coverage`.

### Project Layout

| Path | Purpose |
| --- | --- |
| `src/cli/` | Ink terminal UI, input handling, and Markdown rendering |
| `src/app/` | Application state, commands, models, and local settings |
| `src/agent/` | Session, Run, streaming, and tool execution |
| `src/context/` | Conversation history, tokens, and context compaction |
| `src/model/` | Model providers and HTTP/SSE client code |
| `src/tools/` | Built-in file tools and tool definitions |
| `scripts/` | Build and release helper scripts |

### Roadmap

- [ ] Virtualize the transcript and preserve the reader's resize position with
  a stable message key plus row offset. Invalidate wrapped item heights when
  the terminal width changes; do not anchor to DOM child indexes.
