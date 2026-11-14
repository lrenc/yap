<div align="center">
  <img src="./assets/logo.svg" width="78" alt="YAP logo" />

  <h1>YAP</h1>

  <p><strong>A focused terminal AI assistant.</strong></p>

  <p>
    Work with models, prompts, and agent tooling without leaving the command line.
  </p>

  <p>
    <img alt="Early development" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Bun" src="https://img.shields.io/badge/runtime-Bun-000000?style=flat-square&logo=bun&logoColor=white" />
    <img alt="Terminal UI" src="https://img.shields.io/badge/UI-Ink-61AFEF?style=flat-square" />
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  </p>
</div>

---

## Overview

YAP is a terminal-native foundation for an AI coding assistant. It combines an
interruptible agent runtime with a command-driven interface for model selection,
credential management, reasoning controls, and reusable prompts.

The project is intentionally local-first: configuration lives in your home
directory, API requests go directly to the configured provider, and no YAP
proxy service is involved.

> [!IMPORTANT]
> YAP is in active development. The agent runtime and command interface are
> implemented, while ordinary conversation submission and transcript rendering
> in the terminal are still being completed.

## Highlights

- **Terminal-native experience** built with TypeScript, React, and Ink.
- **Model controls** for model selection and reasoning effort.
- **Reusable Prompt library** stored as editable Markdown files.
- **Local configuration** with private file permissions on POSIX systems.
- **Interruptible agent runtime** with streaming responses, tool calls, loop
  protection, and context compaction.
- **Strict engineering baseline** with strict TypeScript, unit tests, and
  explicit cancellation handling.

## Quick Start

### Requirements

- [Bun](https://bun.sh/) 1.4 or newer
- A DeepSeek API key
- A modern interactive terminal

Recommended terminals:

| Platform | Recommended |
| --- | --- |
| macOS | iTerm2 or Ghostty |
| Windows | Windows Terminal or WezTerm |
| Linux | GNOME Terminal or Kitty |

### Run from source

```bash
git clone https://github.com/lrenc/yap.git
cd yap
bun install
bun run start
```

YAP currently runs directly from the repository. It is not yet distributed as
an npm package or standalone binary.

## Configure YAP

Start YAP and open the configuration panel:

```text
/config
```

Use the panel to:

- Store or clear the provider API key.
- Choose the default reasoning effort for the active model.

Then select a model:

```text
/model
```

Or select one directly:

```text
/model deepseek-v4-pro
```

Configuration changes apply from the next agent run.

## Models

YAP currently includes two built-in models:

| ID | Name | Context | Reasoning efforts |
| --- | --- | ---: | --- |
| `deepseek-flash` | DeepSeek Flash | 1,000,000 | `none`, `low`, `high`, `max` |
| `deepseek-v4-pro` | DeepSeek Pro | 1,000,000 | `none`, `low`, `high`, `max` |

Both models default to `high` reasoning effort. The model catalog is defined in
code in [`src/app/models.ts`](./src/app/models.ts).

## Prompts

Manage reusable prompts with:

```text
/prompt
```

The Prompt panel supports:

- Creating a Prompt.
- Editing and deleting existing Prompts.
- Selecting the default Prompt or another stored Prompt.

Prompt files are plain Markdown and remain easy to back up, inspect, or edit
outside YAP.

## Commands

| Command | Description |
| --- | --- |
| `/model [id]` | Open the model picker, or select a model by ID. |
| `/config` | Manage the API key and reasoning effort. |
| `/prompt [name\|default]` | Open Prompt management, or select a Prompt directly. |
| `/new` | Start a new conversation and reset the current context. |

Type `/` to open the command palette and filter commands by prefix.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Enter` | Submit the current input or selection. |
| `Shift+Enter` / `Alt+Enter` | Insert a newline. |
| `Up` / `Down` | Navigate menus, suggestions, or multiline input. |
| `Esc` | Close a panel or go back. |
| `Ctrl+C` | Exit YAP. |

## Local Data

YAP stores its state in a `.yap` directory under your home directory:

```text
~/.yap/
├── config.json
├── secrets.json
└── prompts/
    ├── concise.md
    └── reviewer.md
```

On POSIX systems, YAP attempts to keep the directory private (`0700`) and its
files readable only by the current user (`0600`).

> [!WARNING]
> API keys are stored in `secrets.json` as plain text. YAP does not currently
> use an OS keychain or encrypt the file. Protect your home directory and do not
> commit this file to version control.

## Development

Run the full checks before submitting changes:

| Command | Purpose |
| --- | --- |
| `bun run typecheck` | Type-check the complete project. |
| `bun test` | Run the test suite. |
| `bun run test:coverage` | Run tests with coverage. |

## Project Status

- [x] Agent run loop and streaming transport
- [x] Tool execution and cancellation
- [x] Context tracking and compaction
- [x] Model and credential configuration
- [x] Prompt management
- [x] Slash command interface
- [ ] Ordinary conversation submission in the CLI
- [ ] Conversation transcript rendering
- [ ] Session persistence and restore
- [ ] Standalone release packaging

## License

YAP is available under the [MIT License](./LICENSE).
