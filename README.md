<div align="center">
  <img src="./assets/logo.svg" width="78" alt="YAP logo" />

  <h1>YAP</h1>

  <p><strong>A local-first harness for terminal AI agents.</strong></p>

  <p>
    <img alt="Early development" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22%2B-5FA04E?style=flat-square&logo=node.js&logoColor=white" />
    <a href="https://www.npmjs.com/package/@lrenc/yap"><img alt="npm version" src="https://img.shields.io/npm/v/@lrenc/yap?style=flat-square" /></a>
  </p>

  <p><a href="./README.zh-CN.md">简体中文</a></p>
</div>

---

YAP is a local-first harness for terminal AI agents. The terminal is its primary
interface, while the core of the project is an interruptible Agent runtime with
streamed model output, validated tool calls, loop protection, message
queueing, and context budgeting.

Around that runtime, YAP provides reusable Prompts, per-model reasoning controls,
and local model and credential management. It is designed to cover the key
capabilities of a modern Agent harness, including clear execution boundaries,
reproducible configuration, recoverable sessions, permission-controlled
actions, and extensible integrations.

## Features

Checked capabilities are available now. Unchecked items describe the next
harness capabilities on the implementation path.

- [x] **Interruptible execution** — Cancel active work or queue follow-up
  messages.
- [x] **Tool-aware Agent loop** — Run validated tools and detect stalled
  execution.
- [x] **Context management** — Budget tokens and compact long conversations.
- [x] **Reusable Prompts** — Manage and switch local Markdown Prompts.
- [x] **Model and provider support** — Use DeepSeek or Zhipu GLM with
  configurable reasoning.
- [x] **Local-first configuration** — Keep settings, Prompts, and credentials on
  your machine.
- [x] **Structured run events** — Follow model turns, tools, compaction, and
  completion state.
- [x] **Terminal transcript** — Read streamed Markdown and browse earlier output.
- [ ] **Safe workspace operations** — Add approval-controlled file, shell, and
  recovery tools.
- [ ] **Durable sessions** — Save and resume conversations, state, and
  checkpoints.
- [ ] **Project-aware context** — Load project rules and retrieve relevant
  repository context.
- [ ] **Extensible integrations** — Add MCP, hooks, plugins, skills, and custom
  tools.
- [ ] **Parallel agents** — Run isolated subagents and coordinate shared work.
- [ ] **Evaluation and replay** — Trace, replay, and benchmark Agent runs.

## Quick Start

Requires Node.js 22 or newer.

Run YAP in an interactive terminal; redirected input and output are rejected.

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

## Interaction and Run Control

Type a message and press Enter to send it. Use Shift+Enter or Alt+Enter for a
new line. Follow-up messages can be entered while a run is active and become
part of the current conversation. Escape cancels queued and running Agent work
without exiting YAP. Ctrl+C exits.

The transcript renders assistant Markdown, including headings, lists, quotes,
tables, directory trees, code blocks, and inline formatting. It also shows
streamed responses, tool activity, compaction, and errors. Use the mouse wheel
or Page Up/Page Down to review earlier output. New output continues to follow
the bottom until you scroll away. Use `/new` to start a fresh conversation
context.

YAP uses the terminal's alternate screen for its transcript. Exiting restores
the previous terminal contents; use the transcript while YAP is open.

## Models

Supported models:

- DeepSeek Flash (`deepseek-flash`)
- DeepSeek Pro (`deepseek-v4-pro`)
- GLM-5.3 (`glm-5.3`)

Select a model directly with `/model <id>` or use `/model` without an argument
to open the picker.

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
| `src/cli/` | Terminal client, input handling, and Markdown rendering |
| `src/app/` | Harness input flow, terminal commands, and Agent lifecycle orchestration |
| `src/agent/` | Agent configuration and capabilities, Session/Run lifecycle, model catalog, and local settings |
| `src/context/` | Conversation history, tokens, and context compaction |
| `src/model/` | Responses protocol types, HTTP/SSE clients, and provider adapters |
| `src/tools/` | Built-in file tools and tool definitions |
| `scripts/` | Build and release helper scripts |
