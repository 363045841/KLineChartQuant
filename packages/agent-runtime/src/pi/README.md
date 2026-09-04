# Pi Runtime Adapter

此模块将宿主提供的模型、工具、上下文和安全规则转换为 Pi Agent 的一次运行，并把 Pi 原始事件投影为稳定的 Agent UI 协议事件。

## 入口

`PiRunDriver` 是运行入口：

- `run(plan, emit)` 执行一份 `PiRunPlan`，持续通过 `emit` 输出助手文本和工具生命周期事件。
- `abort()` 取消当前运行；Pi、Provider 和工具共享该取消路径。
- `waitForIdle()` 等待当前运行完全停止。

同一个 `PiRunDriver` 同时只能拥有一个活动运行。并发调用 `run` 会抛出 `RUN_ACTIVE`；需要并行运行时应创建独立的驱动器。

## 运行计划

`PiRunPlan` 由 Provider 适配层创建，包含：

- `model` 与 `streamFn`：模型描述和流式调用实现。
- `transcript`、`prompt`、`scope` 与 `systemPrompt`：本轮模型上下文。
- `tools`：宿主允许模型调用的图表工具。
- `classifyProviderError`：将 Pi 流式失败映射为稳定的 `AgentRuntimeError`。
- `toolTurnLimit` 与 `timeoutMs`：工具循环和总运行期限约束。

默认最多允许 20 个工具轮次，硬上限为 20；默认总超时为 120 秒。超过限制时，驱动器会取消 Pi 运行并返回 `TOOL_LOOP_LIMIT` 或 `DEADLINE_EXCEEDED`。

## 工具适配与事件

宿主使用 `RuntimeToolDefinition` 定义工具的参数 Schema、安全等级、可逆性和执行函数。驱动器会：

- 为每个工具调用生成带 `runId` 命名空间的公开 ID，避免跨运行冲突。
- 将启动、进度和结束事件投影为 `tool.started`、`tool.progress`、`tool.finished`。
- 将助手流式文本投影为 `assistant.message.started`、`assistant.text.delta` 和完成或失败事件。
- 聚合每条助手消息的 Pi 用量，最终返回 `AgentUsageView`。

工具执行完成后的结果会缓存到本次运行结束，以便 Pi 的结束事件补充 UI 所需的摘要、证据和撤销令牌。

## 安全与隐私

驱动器在发送文本增量、工具输入摘要、工具结果正文和详情前统一调用 `redactString` 或 `redactValue`。不要绕过 `PiRunDriver` 直接将 Pi 原始事件、原始工具参数或工具结果发送到 UI 或持久化层。

工具必须尊重 Pi 提供的 `AbortSignal`，并仅通过 `progress` 回调发送可安全展示的进度信息。
