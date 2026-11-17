<div align="center">
  <img src="./assets/logo.svg" width="78" alt="YAP logo" />

  <h1>YAP</h1>

  <p><strong>A focused terminal AI assistant.</strong></p>

  <p>
    <img alt="Early development" src="https://img.shields.io/badge/status-early%20development-orange?style=flat-square" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="Bun" src="https://img.shields.io/badge/runtime-Bun-000000?style=flat-square&logo=bun&logoColor=white" />
  </p>
</div>

---

YAP is a local-first AI coding assistant for the terminal. It provides an
interruptible agent runtime, reusable prompts, and simple controls for models
and credentials.

> [!NOTE]
> YAP is still in early development. Session persistence and standalone
> packaging are not complete.

## Quick Start

You need [Bun](https://bun.sh/) 1.4 or newer and a DeepSeek API key.

```bash
git clone https://github.com/lrenc/yap.git
cd yap
bun install
bun run start
```

Inside YAP, use `/config` to set the API key and `/model` to choose a model.

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

| ID | Context | Reasoning efforts |
| --- | ---: | --- |
| `deepseek-flash` | 1,000,000 | `none`, `low`, `high`, `max` |
| `deepseek-v4-pro` | 1,000,000 | `none`, `low`, `high`, `max` |

Both models default to `high` reasoning effort.

## Prompts

Prompts are stored as plain Markdown files and can be created, edited, or
selected with `/prompt`.

## Development

```bash
bun run typecheck
bun test
```

For coverage, run `bun run test:coverage`.

### TODO

- [ ] Virtualize the transcript and preserve the reader's resize position with
  a stable message key plus row offset. Invalidate wrapped item heights when
  the terminal width changes; do not anchor to DOM child indexes.

## License

[MIT](./LICENSE). See [third-party notices](./THIRD_PARTY_NOTICES.md) for
adapted terminal UI code.
