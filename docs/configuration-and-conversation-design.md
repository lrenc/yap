# YAP 配置与对话链路设计方案

状态：草案

日期：2026-11-12

## 1. 目标

打通以下完整链路：

```text
用户输入
  -> 命令处理或会话提交
  -> Agent Run
  -> 模型请求
  -> 流式事件
  -> CLI 展示
```

在进入对话链路之前，先完成配置功能。配置需要覆盖：

- 模型查看与切换
- Provider API Key 管理
- 当前模型的 reasoning effort 管理
- 系统提示词模板管理
- 用户目录 `~/.yap/` 下的持久化
- 所有运行配置统一在下一 Run 开始时生效
- `/new` 作为独立上下文重置入口的语义

模型目录是代码内静态资源，不允许用户新增或删除模型。

## 2. 总体架构

建议将配置系统、命令系统和 CLI 展示层分开，由应用运行时负责连接。

```text
CLI Input
   |
   -> App Runtime / Global Input Queue
        |
        +-- /command --> Command Runtime --> Settings Store
        |
        +-- message ---> Session / Run
                           |
                           +-- Context
                           +-- Provider Client
                           +-- Tools
                           |
CLI Transcript <---- AgentEvent stream <--+
```

建议新增或补全以下模块：

| 位置 | 职责 |
|---|---|
| `src/app/app.ts` | 应用运行时，持有全局输入队列、当前 Session、Settings Store、待消费配置和 Run 配置解析逻辑 |
| `src/app/settings/types.ts` | 配置、密钥、模型参数和 Prompt 的领域类型 |
| `src/app/settings/schema.ts` | 基于 Zod 的磁盘数据校验 |
| `src/app/settings/store.ts` | 加载、迁移、原子写入、默认值和内存状态 |
| `src/app/settings/prompts.ts` | Prompt 文件管理 |
| `src/app/commands/parse.ts` | 斜杠命令解析 |
| `src/app/commands/model.ts` | `/model` |
| `src/app/commands/config.ts` | `/config` |
| `src/app/commands/prompt.ts` | `/prompt` |
| `src/cli/components/transcript.tsx` | 用户消息、模型流、工具状态和命令结果展示 |
| `src/cli/components/command-panel.tsx` | 模型选择、配置和 Prompt 编辑器的统一面板 |

现有 [Run](../src/agent/run/run.ts) 会读取模型选择和 client。设计上应在每个 Run 开始时捕获一次完整配置快照，Run 内部始终使用该快照。

现有 [Session](../src/agent/session/session.ts) 可以继续负责上下文和 Run 执行。Session 表示一段连续的对话历史，不再固定模型、Prompt 或运行参数。

命令顺序和 Session 边界由 App Runtime 的全局输入队列管理。Session 内部的批量消息处理不能跨越命令、重新排序输入或绕过配置边界。

## 3. 配置作用域

本文中的“下一次 Run”指下一次由用户消息触发的完整 Agent Run。一个 Run 内可以发生多次模型请求和工具调用，但始终使用同一个配置快照。

| 配置 | 生效时机 | 原因 |
|---|---|---|
| 活跃模型 ID | 下一次 Run | 模型可以随任务变化，但一个 Run 内保持一致 |
| 系统提示词 | 下一次 Run | Prompt 可以重新选择，但当前 Run 继续使用开始时快照 |
| Provider API Key | 下一次 Run | 新凭据不插入正在执行的 Run |
| `reasoningEffort` | 下一次 Run | 与模型配置使用相同的 Run 边界 |
| 模型目录 | 不可修改 | 由代码内静态配置提供 |

具体规则：

- 命令执行时立即校验、持久化并更新待消费配置。
- 当前 Run 不改变模型、Prompt、API Key 或 reasoning effort。
- 下一次 Run 开始时读取完整配置快照。
- 正常模型请求、工具调用后的后续请求和上下文压缩都使用该 Run 的同一份快照。
- Session 只保留消息历史和上下文，不固定模型或 Prompt。
- 没有活跃 Session 时，配置命令只更新待消费配置，不创建 Session。
- 当前 Run 正在执行时，斜杠命令排队，等当前 Run 结束后再执行。

这一设计参考成熟 Agent 的 turn 边界：

- Codex 可以把运行中输入的斜杠命令排队到下一轮执行。
- Codex 的 `/model` 会改变当前聊天使用的模型。
- Pi 的 `/model` 和 `/thinking` 会修改当前 Session，并记录在 Session 中。
- Pi 的 `/new` 是独立的新 Session 命令，不负责应用普通配置。

因此 `/new` 不再作为模型、Prompt 或参数生效的必要条件。

### 3.1 Session 创建时机与 `/new`

应用启动时只加载配置，不立即创建 Session 或 Context。

启动流程：

```text
启动
  -> 加载 ~/.yap 配置
  -> activeSession = null
  -> 等待命令或普通用户消息
```

用户可以在此之前执行 `/model`、`/config`、`/prompt`。这些命令不会创建空 Session。

第一条普通用户消息到来时：

1. 自动创建 Session 和 Context。
2. 在 Run 开始时捕获当前配置快照。
3. 提交用户消息并开始模型请求。

新增 `/new` 命令：

```text
/new
```

行为：

- 结束当前 Session 的上下文。
- 清除当前 Context。
- 保留当前模型、Prompt 和运行参数配置。
- 保留屏幕上的历史记录，并插入会话分隔线。
- 不立即创建新的空 Session。
- 下一条普通用户消息到来时再自动创建新 Session。
- 没有活跃 Session 时静默返回，不创建 Session，也不显示错误。

如果当前 Run 正在执行，`/new` 排入命令队列，等当前 Run 结束后执行。它不会取消当前 Run。

`/new` 是全局输入队列中的显式 Session 边界：

- `/new` 前的普通消息属于旧 Session。
- `/new` 后的普通消息属于延迟创建的新 Session。
- `/new` 不修改模型、Prompt 或运行参数。
- `/new` 不是配置生效入口。

## 4. 持久化结构

所有配置保存在用户目录下：

```text
~/.yap/
  config.json
  secrets.json
  prompts/
    concise.md
    reviewer.md
```

### 4.1 `config.json`

存储非敏感配置：

```json
{
  "version": 1,
  "activeModelId": "deepseek-flash",
  "modelSettings": {
    "deepseek-flash": {
      "reasoningEffort": "high"
    },
    "deepseek-v4-pro": {
      "reasoningEffort": "max"
    }
  },
  "activePrompt": null
}
```

字段说明：

- `version`：配置格式版本，用于迁移。
- `activeModelId`：当前待消费配置和未来 Run 使用的模型，同时也是后续新 Session 的默认模型。模型 ID 失效时静默回退到模型列表第一项。
- `modelSettings`：按模型保存的私有参数。
- `activePrompt`：当前待消费配置和未来 Run 使用的 Prompt 名称；`null` 表示使用默认 Prompt。

模型参数按模型分别保存，因为 reasoning effort 属于模型私有参数。

### 4.2 `secrets.json`

API Key 按 Provider 保存：

```json
{
  "version": 1,
  "providers": {
    "deepseek": {
      "apiKey": "..."
    }
  }
}
```

同一个 Provider 下的所有模型共用 API Key。DeepSeek Flash 和 DeepSeek Pro 只需要配置一次。

界面只能显示“已配置”或掩码。完整 Key 不能进入 Transcript、错误信息、事件或日志。

### 4.3 Prompt 文件

Prompt 内容使用独立 Markdown 文件，而不是全部塞入一个 JSON 文件。

优点：

- 多行编辑更自然。
- 单个模板损坏不会影响其他模板。
- 方便手动查看、编辑和备份。
- 名称和当前选择等元数据仍由 `config.json` 管理。

Prompt 名称建议限制为：

```text
[A-Za-z0-9][A-Za-z0-9_-]{0,63}
```

这样可以避免路径穿越和跨平台文件名问题。

## 5. 文件权限与写入策略

第一阶段将 API Key 以明文保存在 `.yap` 中，优先保持实现简单。安全措施包括：

- `~/.yap` 目录权限为 `0700`。
- `config.json`、`secrets.json` 和 Prompt 文件权限为 `0600`。
- 使用现有 `writeFileAtomic` 原子写入。
- 普通配置字段写入成功后才更新对应内存状态；启动时的失效模型回退例外见第 6 节。
- 写入失败时保留旧配置，并向用户显示错误。

第一阶段不引入主密码、对称加密或系统 Keychain。通过 `SecretStore` 接口隔离凭据读写，后续可以在不改变命令和应用层的情况下增加 AES-GCM、系统 Keychain 或其他后端。

如果现有文件权限过宽，加载时应修复权限或显示警告。

Windows 无法完全使用 POSIX 权限时，应依赖平台 ACL，并在文档中说明。

领域层和命令层不应直接依赖 `secrets.json` 的文件格式。

## 6. 默认值与加载策略

首次启动不存在配置时，在内存中生成默认值，并在需要持久化时创建目录和文件。

默认值：

- `activeModelId`: 模型列表第一项，当前为 `deepseek-flash`
- 模型参数为空时使用 `src/app/models.ts` 中的默认值
- `activePrompt`: `null`
- API Key: 未配置

配置加载需要覆盖以下情况：

- 文件不存在：使用默认值。
- 文件损坏或 Schema 不匹配：显示明确路径和错误，不自动覆盖用户文件。
- 版本过旧：执行显式迁移。
- `activeModelId` 在静态模型列表中不存在：静默回退到模型列表第一项，并尝试原子修复 `activeModelId`。
- 活跃 Prompt 文件不存在：回退默认 Prompt 并提示。
- reasoning effort 不在模型允许列表：拒绝保存。

`activeModelId` 失效时：

1. 使用模型列表第一项作为运行时和待消费配置的 `activeModelId`。
2. 保留已移除模型的 `modelSettings`，不立即删除，方便版本回退。
3. 通过原子写入将 `config.json` 中的 `activeModelId` 修复为模型列表第一项。
4. 处理过程保持界面静默，不显示回退或模型不可用提示。
5. 配置修复写入失败时，本次进程继续在内存中使用回退模型，不覆盖原配置，也不额外显示提示。
6. 模型回退不创建 Session。

不处理模型重命名。模型 ID 变化时按“旧 ID 已失效”处理，不使用旧 ID 到新 ID 的映射。

配置写入流程：

```text
读取旧状态
  -> 校验新值
  -> 原子写入磁盘
  -> 更新内存 Store
  -> 通知界面
```

普通命令驱动的每次字段级保存中，任何一步失败都不能让该字段的内存状态与磁盘状态不一致。不同字段之间独立保存，不要求跨文件回滚。

唯一例外是启动时的失效 `activeModelId` 修复：如果原子写入失败，运行时可使用列表第一项作为回退值，同时保留磁盘上的旧 ID；这不是普通字段保存，也不会修改其他配置。

## 7. 默认系统提示词

没有用户自定义 Prompt 时使用内置默认提示词。默认提示词应尽量简洁。

建议内容：

```text
You are YAP, a terminal AI assistant. Help the user complete tasks carefully.
Use tools when they improve accuracy and verify relevant results. Be concise,
state uncertainty and failures clearly, and never claim work you did not do.
```

用户创建自定义 Prompt 后，它直接替换默认系统提示词，而不是叠加第二份默认指令。

摘要功能使用的安全包装消息仍然保留。它不属于用户可配置的系统提示词。

## 8. 命令设计

### 8.1 命令解析

CLI 提交内容时先进行解析：

```text
onSubmit
  +-- 以 "/" 开头 -> 命令解析与执行，不进入 Context
  +-- 普通消息 --> 确保有 Session -> runStream
```

斜杠命令不能作为普通用户消息送入模型。

第一阶段采用单层命令结构：

```text
command name [optional argument]
```

完整命令集合：

```text
/model
/model <id>
/config
/prompt
/prompt <name>
/prompt default
/new
```

命令解析器可以保留扩展参数的能力，但第一阶段不向用户暴露 `list`、`use`、`info`、`add`、`edit`、`delete` 等嵌套动作。模型、配置和 Prompt 的复杂操作通过交互面板完成。

未知命令只显示帮助和错误，不产生模型请求。

暂时不支持以 `/` 开头的普通消息。如后续需要，可以约定使用 `//` 转义。

命令队列规则：

- App Runtime 维护唯一的 FIFO 输入队列，命令和普通消息使用同一顺序。
- 命令不能越过队列中位于它之前的普通消息。
- 命令到达队列头部且没有正在执行的 Run 时立即处理。
- 有正在执行的 Run 时，命令排队，当前 Run 结束后再处理。
- 命令只在两个 Run 之间处理，不能插入正在执行的 Run。
- 命令是配置边界，只有中间没有命令的连续普通消息可以合并为同一个 Run。
- 命令前的普通消息使用命令执行前的配置，命令后的普通消息使用更新后的配置。
- 命令产生的配置变更影响命令完成后的下一次 Run。

### 8.2 `/model`

| 命令 | 行为 |
|---|---|
| `/model` | 打开交互式模型选择器 |
| `/model <id>` | 直接选择模型 |

模型选择器只展示模型名称和当前选择标记，不展示 Provider、API Key、上下文窗口、reasoning effort 或其他附加信息：

```text
Models

> DeepSeek Flash
  DeepSeek Pro
```

模型选择行为：

- 立即校验并持久化模型 ID。
- 更新待消费配置。
- 下一次 Run 使用新模型。
- 不需要执行 `/new`。
- 当前正在执行的 Run 不受影响。
- 模型 ID 不存在时显示错误，不切换模型。

面板操作：

- 上/下方向键移动选择。
- `Enter` 确认。
- `Esc` 关闭面板并返回 Composer。

### 8.3 `/config`

无参数时打开可扩展的配置面板。当前字段包括：

```text
Configuration

> API Key              configured / not configured
  Reasoning Effort     default / none / low / high / max
```

当前配置项：

- API Key：底层仍按 Provider 存储，同一 Provider 共用，但面板只展示 API Key 字段。
- 模型私有配置：reasoning effort。

API Key 编辑器使用隐藏输入或掩码输入，支持替换和清除。

配置面板应以字段列表组织，方便后续增加其他 Provider 或模型参数，而不改变 `/config` 命令本身。

`/config` 始终配置下一次 Run 将使用的模型，即当前 `activeModelId`：

- API Key 根据该模型所属的 Provider 解析。
- reasoning effort 写入该模型的 `modelSettings`。
- 队列中存在尚未执行的 `/model` 时，严格按照 FIFO 顺序确定 `/config` 的操作目标。

保存采用字段级事务。每个字段的保存流程为：

1. 校验当前字段。
2. 原子写入该字段对应的文件。
3. 更新该字段的内存状态。
4. 显示字段级保存结果和 `applies from the next run`。

如果当前 Run 正在执行，命令排队到当前 Run 结束后处理。命令完成后，下一次 Run 使用新配置；当前 Run 不中途更换 API Key 或 reasoning effort。

字段级保存规则：

- API Key 和 reasoning effort 分别写入 `secrets.json` 和 `config.json`。
- 一项保存失败不回滚其他已经保存成功的字段。
- 面板需要分别显示每个字段是否已保存。
- 不提供跨 `config.json` 与 `secrets.json` 的文件级事务。

面板操作：

- `Enter` 进入当前字段编辑或确认选择。
- `Esc` 关闭面板并返回 Composer。
- `Esc` 只取消当前未确认的编辑，不撤销已经保存的其他字段。

### 8.4 `/prompt`

| 命令 | 行为 |
|---|---|
| `/prompt` | 打开交互式 Prompt 管理器 |
| `/prompt <name>` | 直接选择 Prompt |
| `/prompt default` | 恢复默认 Prompt |

Prompt 管理器：

```text
Prompts

> default
  concise
  reviewer

[a] Add  [e] Edit  [d] Delete  [Enter] Use  [Esc] Exit
```

管理器操作：

- 上/下方向键移动选择。
- `Enter` 使用当前选择，等同于 `/prompt <name>`。
- `a` 创建新 Prompt，并打开编辑器。
- `e` 编辑当前 Prompt。
- `d` 删除当前 Prompt。
- `Esc` 关闭面板并返回 Composer。

`default` 是保留名称，不能用于用户模板。

约定：

- 删除当前活跃 Prompt 时要求确认。
- 确认删除后删除文件，并将 `activePrompt` 设为 `null`。
- 空 Prompt 不允许保存。
- 当前 Run 已加载的 Prompt 不受编辑或删除影响。
- 编辑当前活跃 Prompt 后，下一次 Run 读取新的文件内容。
- 在管理器中选择 Prompt 或执行 `/prompt <name>` 后，下一次 Run 生效。
- `/prompt default` 恢复默认 Prompt，将 `activePrompt` 设置为 `null`，但不会删除 `prompts/` 下的自定义文件。
- 管理器内的 add、edit、delete 立即修改 Prompt 文件，但不会改变当前 Run。

### 8.5 Command Panel 统一交互

`/model`、`/config` 和 `/prompt` 使用统一的 Command Panel 容器：

- 面板打开时，Composer 暂停接收输入。
- `Esc` 统一关闭面板并返回 Composer。
- 通过 `Esc` 退出时不提交尚未确认的选择或保存操作。
- 面板关闭后，Composer 恢复焦点。
- 各面板保留相同的边框、标题、选中状态和操作提示风格。

复杂资源操作留在面板内部完成，不重新引入多级斜杠命令。

## 9. 运行时与配置联动

Session 不再固定模型和 Prompt。建议引入 Run 配置快照：

```text
RunConfigSnapshot
  - modelId
  - reasoningEffort
  - instructions
  - provider client
```

快照在每个 Run 开始时生成，当前 Run 内保持不变。API Key 不复制到事件或日志中，Provider client 由 Client Factory 根据当前凭据创建。

### 9.1 Provider Client Factory

职责：

- 根据 Provider ID 读取当前 API Key。
- 同一个 Provider 和相同 API Key 复用已有 client。
- API Key 改变后创建新 client。
- Key 缺失时暂不阻止应用启动。
- 实际请求时如果 Key 缺失，返回可恢复错误，并提示执行 `/config`。
- 每个 Run 开始时解析并捕获本次使用的 client。

错误信息不得包含实际 API Key。

### 9.2 模型与参数

每个 Run 开始时读取：

```text
modelId          <- Settings Store 当前 activeModelId
reasoningEffort  <- 当前模型的 modelSettings
```

这样：

- `/model <id>` 从下一次 Run 开始生效。
- `/config` 修改 reasoning effort 后，下一次 Run 生效。
- 当前 Run 内的工具循环不会中途切换模型或参数。
- 上下文压缩使用当前 Run 的模型、参数和 Provider client。
- 模型或参数变化会改变请求签名，旧 usage calibration 不会错误套用。

### 9.3 Prompt

每个 Run 开始时：

1. 读取 `activePrompt`。
2. 有自定义 Prompt 时读取对应文件。
3. 文件不存在或 `activePrompt` 为 `null` 时使用默认 Prompt。
4. 将 Prompt 文本写入本次 Run 的配置快照。

当前 Run 运行期间不重新加载 Prompt。Prompt 变化会改变请求签名，因此不会错误复用旧请求的 Token 校准结果。

在 Transcript 中显示配置切换事件，例如：

```text
Model changed to deepseek-v4-pro; applies from the next run.
Prompt changed to reviewer; applies from the next run.
```

## 10. CLI 展示层

需要把当前只有 Composer 的终端界面扩展成完整会话界面。

至少包含：

- 顶部或固定区域保留启动信息。
- 中间增加可滚动的 Transcript。
- 用户消息单独展示。
- 当前模型文本按 `text_delta` 实时追加。
- `refusal_delta` 使用不同样式。
- `tool_start` 和 `tool_end` 显示工具名称及运行状态。
- compaction 显示简短状态。
- queue 状态显示等待模型。
- `done` 后展示错误或停止原因。
- Command Panel 打开时禁用 Composer 输入焦点。
- `/model`、`/config`、`/prompt` 面板统一使用 `Esc` 关闭并返回 Composer。
- 面板关闭时不提交未确认的选择或保存操作。
- 配置切换显示明确的“下一 Run 生效”提示。

Agent 事件到界面的映射：

| AgentEvent | CLI 展示 |
|---|---|
| `queue` | 排队或等待模型状态 |
| `compaction_start` | 正在整理上下文 |
| `compaction_end` | 完成或失败 |
| `turn_start` | 当前模型和轮次 |
| `text_delta` | 追加到当前回复 |
| `refusal_delta` | 追加拒绝内容并突出显示 |
| `text_done` | 完成当前文本段 |
| `tool_start` | 工具运行中 |
| `tool_end` | 工具完成、跳过或失败 |
| `done` | 最终状态和错误 |

命令输出也应进入 Transcript，但使用单独的“系统/命令结果”样式。

## 11. 错误处理

需要提供以下可恢复错误：

- 未配置 API Key：提示执行 `/config`。
- API Key 无效：保留 Provider 返回的错误信息，不显示 Key。
- 配置 JSON 损坏：显示文件路径和校验错误。
- Prompt 文件不存在：回退默认 Prompt。
- Prompt 名称非法：拒绝创建。
- reasoning effort 非法：拒绝保存。
- 普通配置字段写入失败：保留该字段的旧内存状态。
- 模型 ID 不存在：显示可用模型列表。
- 流式响应缺少终止事件：返回明确错误。

应用启动和配置命令不应依赖 API Key 已存在。用户需要先能进入应用并完成配置。

## 12. 测试方案

在现有高覆盖率基础上，补充应用级集成测试。

### 12.1 Settings Store

- 首次加载生成默认配置。
- 配置缺失文件、损坏文件和重复加载。
- Schema 校验和版本迁移。
- `activeModelId` 不在模型列表时静默回退到第一项。
- 失效模型回退时保留旧 `modelSettings`。
- 失效模型回退时尝试原子修复配置。
- 配置修复失败时仅在内存使用回退值，不覆盖文件、不显示提示。
- 活跃 Prompt 无效时回退。
- 普通配置字段原子写入失败时内存状态不变。
- Secret 不出现在事件、错误或 Transcript 中。
- Unix 下目录和文件权限。
- Prompt 名称校验、路径穿越和空内容。

### 12.2 Commands

- `/model` 交互选择器和 `/model <id>` 直接选择。
- `/config` 面板中的 API Key 和 reasoning effort。
- `/prompt` 管理器及 `/prompt <name>`、`/prompt default`。
- 模型选择器不展示 Provider、API Key 或模型附加信息。
- `/model`、`/config`、`/prompt` 面板都能通过 `Esc` 返回 Composer。
- `Esc` 不提交未确认的选择或保存操作。
- `default` 是保留的 Prompt 名称。
- 未知命令和错误参数。
- 命令不进入 Context。
- 连续普通消息可以合并为一个 Run。
- 命令会切断消息合并，并成为配置边界。
- 命令后的普通消息使用更新后的配置。
- `/new` 无 Session 时静默返回。
- `/new` 作为输入队列中的 Session 边界。

### 12.3 配置作用域

- 没有 Session 时，`/model`、`/config`、`/prompt` 不创建 Session。
- 第一条普通消息自动创建 Session 和 Context。
- `/config` 保存 Key 后，下一次 Run 使用新 Key。
- `/config` 的目标是下一次 Run 的 `activeModelId` 及其 Provider。
- 当前 Run 的工具循环不读取中途修改的 reasoning effort。
- 当前 Run 不被配置命令中途修改。
- `/model <id>` 在下一次 Run 切换模型，不需要 `/new`。
- `/prompt <name>` 在下一次 Run 加载新 Prompt，不需要 `/new`。
- 编辑当前活跃 Prompt 后，下一次 Run 使用新内容。
- 运行中提交的配置命令排队到当前 Run 结束后执行。
- `/new` 清空 Context，但保留下一次 Run 的有效配置。
- 同一 Provider 的多个模型共用一个 Key。
- API Key 和 reasoning effort 字段分别保存，一项失败不影响其他已保存字段。

### 12.4 对话链路

- 启动和单独执行配置命令时不会创建 Session。
- CLI 输入第一条普通消息后自动创建 Session。
- `Session.runStream` 事件能显示为当前 Transcript。
- `text_delta` 能持续追加。
- 工具调用和结果能展示。
- 缺少 Key、请求失败和取消能显示可恢复错误。
- `/new` 清空 Context，但保留屏幕历史；下一条普通消息重建 Session。
- `/new` 不是应用模型或 Prompt 配置的必要步骤。
- `/new` 前的消息属于旧 Session，之后的消息属于新 Session。

### 12.5 真实 Provider 冒烟测试

现有 Provider 测试全部使用 mock，不能证明真实服务兼容性。

最终需要使用一个真实 API Key 手动验证：

- DeepSeek `/responses` endpoint 是否兼容。
- 流式事件格式。
- reasoning effort 参数。
- 工具调用和工具结果回放。
- 上下文压缩请求。

## 13. 实施顺序

1. 完成 Settings Schema、默认值、目录权限、原子存储和迁移。
2. 实现 Prompt Repository 与内置默认 Prompt。
3. 实现 App Runtime、全局输入队列、Provider Client Factory、待消费配置和 Run 配置快照。
4. 实现单层命令解析器、`/model`、`/config`、`/prompt` 及统一交互面板。
5. 实现 Transcript 和流式事件渲染。
6. 增加 `/new`，作为独立的上下文重置入口。
7. 打通 CLI 输入、Session、模型请求和数据流展示。
8. 补齐应用级集成测试和真实 Provider 冒烟测试。

## 14. 已确认结论

1. 新增 `/new`，但它只负责重置 Context，不负责让普通配置生效。
2. 应用启动时不创建 Session。
3. 第一条普通用户消息到来时自动创建 Session。
4. 配置命令在没有 Session 时不创建 Session。
5. 模型、Prompt、API Key 和 reasoning effort 都在下一次 Run 开始时统一生效。
6. 当前 Run 使用固定配置快照，不在工具循环中途切换。
7. 当前 Run 执行期间，斜杠命令排队到当前 Run 结束后处理。
8. 命令只保留 `/model [id]`、`/config`、`/prompt [name|default]` 和 `/new`。
9. `/model` 不展示 Provider、API Key 或其他模型附加信息。
10. `/config` 使用可扩展字段面板，当前包含 API Key 和 reasoning effort。
11. `/model`、`/config`、`/prompt` 面板统一使用 `Esc` 返回 Composer。
12. 删除当前活跃 Prompt 时要求确认；确认后删除文件并设置 `activePrompt: null`。
13. API Key 第一阶段使用明文 `secrets.json` 保存，权限为 `0600`，通过 `SecretStore` 接口为未来替换留出空间。
14. App Runtime 使用唯一 FIFO 队列处理命令和普通消息。
15. 命令只在两个 Run 之间执行，并作为消息合并和配置生效的边界。
16. `/config` 配置下一次 Run 使用的模型及其 Provider。
17. API Key 和 reasoning effort 采用字段级独立保存，不提供跨文件事务。
18. `/new` 没有活跃 Session 时静默返回。
19. `/new` 是输入队列中的显式 Session 边界。
20. `activeModelId` 不在模型列表时静默回退到列表第一项。
21. 失效模型回退时保留旧 `modelSettings`，并尝试原子修复配置。
22. 配置修复失败时仅在内存使用回退模型，不覆盖原配置、不显示提示。
23. 第一阶段不考虑模型重命名和旧 ID 到新 ID 的映射。

## 15. 后续会话持久化边界

当前配置与对话链路方案与后续消息持久化没有结构性冲突。未来增加持久化时，需要保留以下边界；本节不规定具体目录结构、数据格式或恢复流程。

- 配置、凭据、Prompt 和会话数据保持独立职责，不把对话历史写入 `config.json`。
- 所有会话数据继续位于用户目录下的 `.yap` 范围内。
- 保持 Session 延迟创建和 `/new` 的 Session 边界语义。
- 可见 Transcript 与发送给模型的 Context 分开管理，命令输出不能作为普通模型消息回放。
- 每个 Run 的模型、reasoning effort 和 Prompt 快照必须能够随会话恢复。
- Prompt 选择不能只保留名称；未来持久化时还需保留能够识别实际指令内容的版本信息。
- Session 需要记录工作目录，避免恢复后相对路径和工具结果产生歧义。
- API Key 不进入会话数据，恢复时通过独立的 Provider 凭据配置解析。
- Context 需要提供版本化的导出与恢复边界，确保压缩摘要、边界和当前上下文起点可以恢复。
