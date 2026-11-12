# YAP 配置与对话链路分阶段实施方案

状态：草案

日期：2026-11-12

依据：[配置与对话链路设计方案](./configuration-and-conversation-design.md)

## 1. 实施目标

在控制风险的前提下，将当前只有终端输入界面的 YAP 逐步改造成可配置、可对话、可流式展示的 Agent：

```text
用户输入
  -> 全局 FIFO 队列
  -> 命令处理或消息 Run
  -> Run 配置快照
  -> 模型请求和工具调用
  -> AgentEvent
  -> Transcript 展示
```

本次范围只包括配置、命令、Session 生命周期和对话链路。暂不实现：

- 对话消息持久化。
- Session 恢复。
- API Key 加密或系统 Keychain。
- 模型新增、删除和重命名映射。
- 模型列表中的 Provider、API Key 或模型元信息展示。
- 多级斜杠命令。

## 2. 当前基线

当前源码状态：

- `bun test`：257 个测试通过。
- `bun run typecheck`：通过。
- Agent、Run、Session、Context、模型 Provider 和工具已有完整基础实现。
- CLI 只有启动页和 Composer，输入提交尚未接到 Agent。
- `src/app/app.ts` 当前为未跟踪空文件。
- `src/app/settings/index.ts` 和 `src/app/settings/types.ts` 为空占位。
- `src/context/compaction/budget.ts` 当前存在仅格式化性质的未提交改动。

实施时必须保留当前工作区已有改动，不得重置或覆盖无关修改。

## 3. 实施原则

### 3.1 分阶段交付

每个阶段必须满足：

1. 该阶段行为有独立测试。
2. `bun test` 全部通过。
3. `bun run typecheck` 通过。
4. 旧 CLI 仍可启动。
5. 不提前引入下一阶段的行为。

建议一个阶段对应一个提交或独立变更集。出现回归时只回退当前阶段。

### 3.2 先领域、后运行时、最后 UI

依赖顺序：

```text
Settings 类型和校验
  -> Settings / Secret / Prompt 存储
  -> Provider Client Factory
  -> Run 配置快照
  -> 命令核心
  -> App Runtime 队列和 Session 生命周期
  -> Command Panel
  -> Transcript 流式接线
  -> 完整集成验证
```

在 App Runtime 和 Transcript 完成前，不删除现有 Composer，也不改变当前启动行为。

### 3.3 单一事实来源

- 模型目录只来自 `src/app/models.ts`。
- Provider 目录只来自 `src/app/providers.ts`。
- Prompt 内容只来自 `~/.yap/prompts/<name>.md` 或内置默认 Prompt。
- `activePrompt` 只保存文件名 stem 或 `null`。
- `activeModelId` 只保存模型 ID。
- API Key 只保存于独立的 SecretStore，不进入 Transcript、事件或日志。

### 3.4 测试使用隔离目录

所有 Settings、Secret 和 Prompt 测试必须使用临时目录，不得读取或修改真实 `~/.yap`。

存储类和 App Runtime 应支持注入根目录或依赖对象，避免在测试中依赖进程级环境变量。

## 4. 目标模块边界

建议逐步补齐以下模块：

```text
src/app/
  app.ts
  models.ts
  providers.ts
  types.ts
  settings/
    types.ts
    schema.ts
    defaults.ts
    store.ts
    secrets.ts
    prompts.ts
  providers/
    client-factory.ts
    runtime-models.ts
  commands/
    types.ts
    parse.ts
    registry.ts
  runtime/
    input-queue.ts
    run-config.ts

src/cli/components/
  transcript.tsx
  command-panel.tsx
  model-panel.tsx
  config-panel.tsx
  prompt-panel.tsx
```

文件可以合并，但职责不能混在一起。不得把文件读写、命令解析和 React 展示放进同一个模块。

## 5. 阶段 0：基线与保护措施

### 目标

确认当前基线并保护现有未提交改动。

### 步骤

1. 记录 `git status --short`。
2. 运行 `bun test`。
3. 运行 `bun run typecheck`。
4. 检查 `src/app/app.ts` 是否仍为用户的空占位文件。
5. 不修改 `src/context/compaction/budget.ts`，除非后续阶段明确需要。
6. 建立测试用临时目录 helper，供后续 Settings 和 Prompt 测试复用。

### 验收

- 当前测试和类型检查通过。
- 工作区原有改动保持不变。
- 没有新增生产行为。

## 6. 阶段 1：Settings 领域模型和模型解析

### 目标

定义稳定的配置数据结构、校验规则和失效模型回退行为，不进行真实文件接线。

### 主要文件

- `src/app/settings/types.ts`
- `src/app/settings/schema.ts`
- `src/app/settings/defaults.ts`
- `tests/app/settings/schema.test.ts`
- `tests/app/settings/model-resolution.test.ts`

### 实现内容

1. 定义 `SettingsDocument`：
   - `version`
   - `activeModelId`
   - `modelSettings`
   - `activePrompt`
2. 定义 `ProviderSecrets`。
3. 使用 Zod 校验磁盘结构。
4. 定义 `DEFAULT_MODEL_ID = models[0]?.id`，模型列表为空时明确报错。
5. 默认配置使用模型列表第一项。
6. reasoning effort 校验必须基于模型允许的 efforts。
7. 增加 `resolveModelId`：
   - 有效 ID 原样返回。
   - 失效 ID 静默返回模型列表第一项。
   - 保留未知模型的 `modelSettings`。
   - 返回是否需要修复配置的内部结果，但不对 UI 展示。

### 测试

- 缺失字段生成默认配置。
- 非法类型被 Zod 拒绝。
- 有效模型 ID 保持不变。
- 失效模型静默回退第一项。
- 旧模型的 `modelSettings` 不丢失。
- 模型列表为空时返回可诊断错误。

### 验收

- 没有真实 `~/.yap` 文件读写。
- 模型回退行为可通过纯函数测试。
- 现有 Agent 测试保持不变。

## 7. 阶段 2：Config 和 Secret 文件存储

### 目标

实现 `config.json`、`secrets.json` 的加载、默认值、权限和字段级原子保存。

### 主要文件

- `src/app/settings/store.ts`
- `src/app/settings/secrets.ts`
- `src/app/settings/index.ts`
- `tests/app/settings/store.test.ts`
- `tests/app/settings/secrets.test.ts`

### 实现内容

1. Settings Store 接收可注入的 `.yap` 根目录。
2. 创建目录时使用 `0700`。
3. 文件写入使用 `writeJson` / `writeFileAtomic` 和 `0600`。
4. 文件不存在时使用默认值，不立即写盘。
5. Schema 或 JSON 损坏时返回明确错误，不覆盖用户文件。
6. 普通字段保存流程：
   - 校验字段。
   - 原子写入。
   - 仅在成功后更新内存状态。
7. API Key 和 reasoning effort 独立保存，不提供跨文件事务。
8. `activeModelId` 失效时：
   - 运行时使用第一项。
   - 保留旧 `modelSettings`。
   - 尝试原子修复配置。
   - 修复失败时仅在内存使用回退值。
   - 不产生 UI 提示。
9. SecretStore 先实现明文文件后端。
10. 暴露稳定接口，后续可替换加密或 Keychain 后端。

### 风险控制

- 不在测试中操作真实 home 目录。
- 修复失效模型不得删除未知模型的 settings。
- Secret 不进入错误消息和日志。

### 测试

- 首次加载默认值。
- 目录和文件权限。
- 普通字段保存成功后磁盘和内存一致。
- 普通字段保存失败时状态不变。
- API Key 与 reasoning effort 互相独立。
- 失效 model ID 修复成功。
- 失效 model ID 修复失败时仅内存回退。
- JSON 损坏时不覆盖文件。
- Secret 不出现在错误中。

### 验收

- Store 可独立在临时目录运行。
- 不依赖 App Runtime 或 CLI。
- 旧应用仍可启动。

## 8. 阶段 3：Prompt Repository 和默认 Prompt

### 目标

实现 Prompt 文件管理，不接入 CLI 管理器。

### 主要文件

- `src/app/settings/prompts.ts`
- `src/app/settings/defaults.ts`
- `tests/app/settings/prompts.test.ts`

### 实现内容

1. 定义内置默认 Prompt。
2. Prompt 名称规则：`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`。
3. `default` 作为保留名称。
4. `activePrompt` 保存文件 stem 或 `null`，不保存原文。
5. 创建、读取、编辑、删除均使用原子写入。
6. 删除当前活跃 Prompt 后由上层设置 `activePrompt: null`。
7. Prompt 不存在时加载默认 Prompt。
8. 编辑当前活跃 Prompt 后，下一次读取返回新内容。
9. Prompt Repository 不负责确认 UI；确认属于 Command Panel。

### 测试

- 列出 Prompt。
- 创建和读取 Prompt。
- 拒绝非法名称。
- 拒绝 `default` 用户文件。
- 拒绝空 Prompt。
- 编辑后读取新内容。
- 删除文件。
- 路径穿越不能逃出 prompts 目录。
- 权限为 `0600`。

### 验收

- Prompt 文件逻辑独立于 Settings Store。
- `activePrompt` 的选择关系仍由 Settings Store 管理。
- 未创建 Prompt 时使用内置默认 Prompt。

## 9. 阶段 4：Provider Client Factory

### 目标

将模型目录、Provider 目录和 API Key 组合为运行时模型，不接入 CLI。

### 主要文件

- `src/app/providers/client-factory.ts`
- `src/app/providers/runtime-models.ts`
- `tests/app/providers/client-factory.test.ts`

### 实现内容

1. 根据静态 Provider 配置和 SecretStore 创建 `OpenAIClient`。
2. 同一个 Provider 和相同 API Key 复用 client。
3. API Key 改变后创建新 client。
4. 缺少 Key 时返回清晰的配置错误，不阻止应用启动。
5. 不把 API Key 放入错误、事件或日志。
6. 将静态模型配置转换为 `AgentModel`，client 通过运行时工厂获得。

### 测试

- 相同 Provider 和 Key 复用。
- Key 改变后创建新实例。
- 不同 Provider 使用不同 client。
- 缺少 Key 时不调用 fetch。
- 错误和日志中不包含 Key。

### 验收

- 不需要真实网络即可验证。
- 不改变当前模型请求实现。

## 10. 阶段 5：Run 配置快照重构

### 目标

确保每个 Run 在开始时捕获一次模型、reasoning effort、Prompt 和 client，Run 内保持不变。

### 主要文件

- `src/app/runtime/run-config.ts`
- `src/agent/run/run.ts`
- `src/agent/run/request.ts`
- `src/agent/session/session.ts`
- `src/agent/session/types.ts`
- `src/agent/types.ts`
- 对应 Agent Run 和 Session 测试

### 实现内容

1. 定义 `RunConfigSnapshot`：
   - `model`
   - `reasoningEffort`
   - `instructions`
   - `client`
2. `Run.execute()` 开始时只解析一次配置快照。
3. Run 内所有模型请求和 compaction 使用同一快照。
4. `buildRequest` 支持使用快照中的 instructions。
5. Session 的提交前预算检查也使用当前配置。
6. 保持 `run()`、`runStream()` 现有调用兼容。
7. 不在快照中复制 API Key；只保存已创建的 client。

### 测试

- 一个 Run 内解析配置一次。
- tool loop 的中途配置变化不会影响当前 Run。
- 下一个 Run 使用新配置。
- compaction 与正常请求使用同一模型和 client。
- 模型、Prompt 改变后 request signature 更新。
- 旧的 Session 和 Run 测试继续通过。

### 风险控制

- 本阶段先保持单消息 Run API，不引入命令队列。
- 行为变化局限在“配置读取时机”，不要同时修改 UI。

### 验收

- 现有 Agent 和 Context 压缩测试全部通过。
- 可以由 mock client 验证两个连续 Run 使用不同配置。

## 11. 阶段 6：命令解析和命令核心

### 目标

实现单层命令解析和命令执行逻辑，不实现 React 面板。

### 主要文件

- `src/app/commands/types.ts`
- `src/app/commands/parse.ts`
- `src/app/commands/registry.ts`
- `tests/app/commands/parse.test.ts`

### 支持的命令

```text
/model
/model <id>
/config
/prompt
/prompt <name>
/prompt default
/new
```

### 实现内容

1. 只有首字符为 `/` 时进入命令解析。
2. 不支持嵌套动作。
3. 定义命令结果为：
   - `notice`
   - `panel_request`
   - `new_session`
   - `noop`
4. `/model <id>` 校验模型并更新配置。
5. `/prompt <name>` 校验 Prompt 并更新 `activePrompt`。
6. `/prompt default` 设置 `activePrompt: null`。
7. `/model`、`/config`、`/prompt` 返回面板请求。
8. `/new` 返回 Session 边界动作。
9. 未知命令返回错误，不进入 Context。

### 测试

- 每种命令参数。
- 未知命令。
- 非法模型和 Prompt。
- 命令输出不进入 Context。
- `/prompt default` 产生 `activePrompt: null`。

### 验收

- 命令层可以独立于 CLI 和 React 测试。
- 不创建 Session。

## 12. 阶段 7：App Runtime、全局 FIFO 和 Session 生命周期

### 目标

实现唯一输入队列、延迟 Session 创建、命令边界和 Run 批处理。

### 主要文件

- `src/app/app.ts`
- `src/app/runtime/input-queue.ts`
- `src/agent/session/session.ts`
- 对应 App Runtime 和 Session 测试

### 实现内容

1. App Runtime 启动时只加载配置和依赖，不创建 Session。
2. App Runtime 接收可注入的 Settings、Secret、Prompt、Client Factory、工具列表和工作目录。
3. 默认注册现有 `readFileTool` 和 `readDirTool`。
4. 命令和普通消息进入同一个 FIFO。
5. 命令不能越过队列中较早的普通消息。
6. 命令只在两个 Run 之间处理。
7. 只有中间没有命令的连续普通消息可以合并为一个 Run。
8. 首条普通消息到达时创建 Session 和 Context。
9. 当前 Run 未结束时，App Runtime 不把后续消息提交给 Session，避免触发 Session 现有的 interrupt 行为。
10. `/new` 无活跃 Session 时静默 noop。
11. `/new` 有 Session 时结束当前 Context，下一条消息再创建新 Session。
12. `/new` 是输入队列边界，前后的消息不得跨边界合并。
13. Command Panel 打开时暂停队列。
14. Panel 关闭后再继续处理后续输入。
15. App Runtime 暴露初始化错误，供 CLI 显示配置损坏等问题。

### Session 批处理要求

需要为 Session 增加“一个 Run 包含多条用户消息”的明确入口，例如 `runMessages()`。不得通过字符串拼接模拟多条消息，也不得让多个 Run 并发执行。

现有单消息 `run()` 和 `runStream()` 保留为兼容包装。

### 测试

- 启动时不创建 Session。
- 配置命令不创建 Session。
- 首条普通消息自动创建 Session。
- 连续消息合并。
- 命令切断合并。
- 命令后的消息使用新配置。
- 运行中输入命令时排队。
- `/new` 无 Session 静默。
- `/new` 前后消息属于不同 Session。
- Panel 打开时后续输入不越过 Panel。

### 验收

- App Runtime 可以使用 fake client 完整运行，不依赖 Ink。
- 队列顺序可重复验证。
- fake client 可以收到已注册的文件工具定义。

## 13. 阶段 8：Command Panel

### 目标

实现 `/model`、`/config`、`/prompt` 的统一交互面板。

### 主要文件

- `src/cli/components/command-panel.tsx`
- `src/cli/components/model-panel.tsx`
- `src/cli/components/config-panel.tsx`
- `src/cli/components/prompt-panel.tsx`
- `src/cli/components/composer.tsx`
- 对应组件测试

### 通用规则

- Panel 打开时 Composer 禁用输入和焦点。
- `Esc` 关闭 Panel 并恢复 Composer。
- `Esc` 不提交未确认的编辑。
- `Enter` 用于确认或进入字段。
- Panel 标题、边框和选中样式保持一致。

### `/model`

- 只展示模型名称和当前选择标记。
- 不展示 Provider、API Key、上下文窗口、reasoning effort 或其他元信息。
- 上下方向键移动。
- Enter 选择。
- Esc 取消。

### `/config`

- 当前字段只有 API Key 和 Reasoning Effort。
- 字段列表结构必须支持后续增加字段。
- API Key 使用隐藏输入或掩码。
- 每个字段独立保存并显示保存状态。
- 一个字段保存失败不影响其他字段。
- Esc 不撤销已经保存成功的字段。
- `/config` 的目标是下一次 Run 的 `activeModelId` 及其 Provider。

### `/prompt`

- 默认 Prompt 显示为 `default`。
- Enter 选择。
- `a` 新增。
- `e` 编辑当前 Prompt。
- `d` 删除。
- 删除当前活跃 Prompt 时必须确认，确认后设置 `activePrompt: null`。
- Prompt 编辑器应支持多行内容和一个明确的保存操作。
- Esc 关闭 Panel，不保存当前未确认内容。

### 测试

- 模型列表不出现 Provider 和 Key。
- 三个 Panel 的 Esc 行为一致。
- 配置字段部分成功。
- Prompt 删除确认。
- Prompt 名称校验错误。
- Panel 打开时 Composer 不响应输入。

### 验收

- 只接入 Panel 组件测试，不要求完整模型请求。
- Panel 可以独立通过测试驱动。

## 14. 阶段 9：Transcript 和真实对话流接线

### 目标

将 App Runtime 和 CLI 接通，完成用户输入到模型事件展示的完整链路。

### 主要文件

- `src/cli/terminal.tsx`
- `src/cli/components/transcript.tsx`
- `src/cli/index.tsx`
- 对应 Terminal 和 Transcript 测试

### 实现内容

1. App Runtime 实例在 Terminal 生命周期内保持稳定。
2. Composer 提交接到 App Runtime。
3. Transcript 展示用户消息和命令结果。
4. 模型文本按 `text_delta` 追加。
5. `refusal_delta` 独立展示。
6. `tool_start` 和 `tool_end` 展示工具状态。
7. `compaction_start` 和 `compaction_end` 展示状态。
8. `queue` 展示排队状态。
9. `done` 展示完成、错误或取消。
10. 命令 Panel 与 Composer 焦点互斥。
11. 删除当前占位接线后，普通输入必须触发真实或注入的 App Runtime。
12. 启动配置损坏时显示文件路径和校验错误。
13. 活跃 Prompt 文件缺失时回退默认 Prompt，并显示恢复提示。

### 测试

- 输入普通消息后出现用户消息和 assistant 流。
- fake client 的 `text_delta` 持续追加。
- 工具事件可见。
- 错误和取消可见。
- 命令结果进入 Transcript，Model Context 不包含命令。
- Panel 关闭后 Composer 恢复。

### 风险控制

- 使用 mock `OpenAIClient` 完成第一轮接线。
- 真实 Provider 调用放到最后验证。
- 不在本阶段修改 Agent 请求协议。

### 验收

- `bun run start` 可以打开现有界面。
- 在注入 fake runtime 的测试中完成一次完整对话。
- 没有 Key 时显示可恢复错误，而不是崩溃。

## 15. 阶段 10：集成加固与真实 Provider 冒烟

### 目标

完成跨模块场景、错误路径和真实服务验证。

### 集成场景

1. 启动后先执行 `/model`，再发送首条消息。
2. 启动后先执行 `/config`，再发送首条消息。
3. 启动后先执行 `/prompt`，再发送首条消息。
4. 配置命令不会创建 Session。
5. 首条消息自动创建 Session。
6. `/model <id>` 在下一 Run 生效。
7. `/config` 修改 Key 和 effort 在下一 Run 生效。
8. `/prompt <name>` 在下一 Run 生效。
9. 编辑当前活跃 Prompt 后下一 Run 使用新内容。
10. 同一 Provider 的模型复用一个 Key。
11. `/new` 无 Session 时静默。
12. `/new` 清空 Context 但保留 UI 历史。
13. 命令和消息 FIFO、合并和配置边界。
14. 当前 Run 中配置快照不变。
15. Panel 中的 Esc 行为。
16. Secret 不出现在 Transcript、事件和错误中。
17. 失效 `activeModelId` 的静默回退不产生 Transcript 提示。
18. Prompt 文件缺失时回退默认 Prompt，并产生一次恢复提示。

### 真实 Provider 冒烟

使用真实 DeepSeek API Key 手动验证：

- `/responses` endpoint 兼容性。
- SSE content type 和终止事件。
- reasoning effort 请求参数。
- 普通文本流。
- 工具调用和工具结果回放。
- 上下文压缩请求。

真实 Key 只能用于本地手动验证，不得写入测试、文档、日志或提交。

### 最终门禁

```bash
bun test
bun test --coverage
bun run typecheck
bun run start
```

验收要求：

- 所有既有测试和新增测试通过。
- 覆盖率不低于当前基线。
- 启动后可以完成配置、发送消息和查看流式回复。
- 没有未处理 Promise rejection。
- 不新增任何会话持久化实现。

## 16. 关键风险与处理

| 风险 | 处理 |
|---|---|
| Settings 测试污染真实 home | Store 必须支持注入临时根目录 |
| Secret 泄露 | 独立 SecretStore，错误和事件中永不输出 Key |
| 模型回退修复失败导致状态歧义 | 仅内存回退，磁盘保留旧值，静默处理 |
| Run 中途读取新配置 | Run 开始只解析一次 `RunConfigSnapshot` |
| 双队列导致命令和消息乱序 | App Runtime 作为唯一 FIFO，命令作为批处理边界 |
| 多消息被字符串拼接 | 使用 `runMessages()`，逐条写入 Context |
| Command Panel 和 Composer 同时抢输入 | Panel 打开时 Composer 失焦并暂停队列 |
| Prompt 文件名与内容不一致 | `activePrompt` 存名称，Run 启动时读取实际内容 |
| 删除活跃 Prompt 后悬空 | 确认删除后原子设置 `activePrompt: null` |
| 配置跨两个文件部分失败 | 字段级保存，不承诺跨文件事务 |
| 启动配置损坏导致应用静默失效 | App Runtime 暴露初始化错误，Terminal 显示可恢复错误 |
| 文件工具未注册导致模型无法读取项目 | App Runtime 默认注册现有文件工具并增加集成测试 |
| 提前实现持久化影响范围 | 只保留设计边界，本计划不实现 SessionStore |

## 17. 建议提交拆分

1. `feat: add settings schema and model resolution`
2. `feat: add config and secret stores`
3. `feat: add prompt repository`
4. `feat: add provider client factory`
5. `refactor: snapshot run configuration`
6. `feat: add command parsing and registry`
7. `feat: add runtime input queue and lazy sessions`
8. `feat: add command panels`
9. `feat: connect transcript to agent stream`
10. `test: cover configuration and conversation integration`

每个提交都应附带对应测试，并保持 `bun test` 和 `bun run typecheck` 通过。

## 18. 完成定义

满足以下条件后，本次实施完成：

- 用户无需 `/new` 即可让模型、Prompt、API Key 和 reasoning effort 在下一 Run 生效。
- 启动时不会创建空 Session。
- `/new` 只重置上下文，没有 Session 时静默。
- 命令和普通消息遵循唯一 FIFO 和命令边界。
- 三个 Command Panel 可用，统一通过 `Esc` 返回 Composer。
- `/model` 只展示模型名称和选择标记。
- `/config` 支持字段级 API Key 和 reasoning effort 保存。
- `/prompt` 支持管理、选择和恢复默认 Prompt。
- 普通输入可以触发模型请求，并把文本、工具、压缩、队列和错误事件展示在 Transcript。
- 当前 Run 使用固定配置快照，下一次 Run 使用更新后的配置。
- 现有测试、类型检查、启动检查和真实 Provider 冒烟均通过。
- 不实现超出当前方案范围的 Session 持久化。
