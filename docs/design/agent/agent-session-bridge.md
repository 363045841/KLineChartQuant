# Agent 会话桥接：官方条目直出

## 决策

UI 渲染的唯一数据源是 Pi 的官方会话记录：

- `Conversation.watch()` 推送 `ConversationView`，客户端用官方 `ConversationTranscript` 累积成 `TranscriptView`（`items` 含更早/缺失占位）。
- 会话内容不再投影成 `messages` / `toolCalls` / `runs` 三个自定义数组，也不再在 UI 侧按时间戳重排。
- 工具调用、工具结果、思考与正文的位置由官方 `AssistantMessage.content` 块顺序决定；一条 `toolCall` 的工具卡就渲染在该块位置。

## 数据形状

```ts
interface AgentTranscriptView {
  conversation: ConversationRecord   // 官方会话记录，含 parent 分支来源
  items: TranscriptItem[]            // 官方条目窗口 + 客户端已加载历史
  docs: Record<string, JsonObject>   // pi.live / pi.usage / pi.agent …
  title: string                      // 来自 KQ 会话文档
}
```

Workspace 事件只有五类：`session.changed`、`session.closed`、`sessions.changed`、`provider.status.changed`、`tool.question.required/resolved`。

## 保留的自研

| 职责 | 原因 |
| --- | --- |
| `KqSessionDoc`（标题、最近活动时间） | Pi 不维护会话目录元数据；文档 fork 语义 `current` 让分支继承标题 |
| `AgentSessionService.startRun/cancel/retry/edit` | 把用户动作映射到官方 `submit`、`abort`、`fork` |
| 运行计划工厂（模型、工具、系统提示词） | 宿主必须提供图表工具、Provider 凭据与上下文注入 |
| 挂起提问表 | `ask_user` 需要宿主 Promise 结算，属于交互而非状态 |

## 删除的层

- `kq.run.started` / `kq.run.terminal` 自定义运行记录：运行状态由官方 `Submission` 与 `pi.live.runFailure` 表达。
- `conversation-projection` 的合成逻辑与 `hostFailures` 映射：不再合并多份运行状态。
- UI 侧 `useAgentTimeline` 排序与 `displayConversation` 合并：顺序与内容都由官方条目流给出。
- `pi-run-driver` 事件投影驱动与增量事件契约（`tool.started`、`assistant.*.delta`）：`pi.live` 已提供流式窗口。
- `security/redaction`：脱敏不在本版本范围内，删除后 prompt 与工具结果原样落盘。

## 分页

`Conversation.watch()` 只给最近一页（默认 50）。更早历史由 `ConversationTranscript.loadEarlier()` 通过官方 `Conversation.entries()` 分页补齐；缺失区间显示为 `gap` 占位，点击调用 `fillGap()`。UI 不再全量扫描历史。

## 兼容已发布数据

已发布版本把会话标题写在 `kq.session.identity` 文档、最近活动时间写在 `kq.session.metadata` entry 里，没有新的 `kq.session` 文档。浏览器与 Node 入口在打开存储后调用一次 `AgentSessionService.adoptLegacySessions()`：

- 仅为缺少 `kq.session` 的主分支会话回填 `{ title, updatedAt }`；
- 跳过已删除会话、旧分支（`fork:` lane）和没有元数据的会话；
- 幂等，已有新文档时不再写入。

数据库名保持 `kq-agent-durable-v2`，不搬库、不改存储格式。旧条目（`pi.user` / `pi.assistant` / `pi.tool-result`）与旧工具 details 形状不变，回填后可直接渲染；`kq.*` 自定义 entry 由渲染层忽略。

## 代价

UI 渲染直接依赖 Pi 的条目字段（`pi.user`、`pi.assistant`、`pi.tool-result`、`content` 块）。Pi 升级条目形状时，渲染层需要同步；这是有意选择，换取单一事实源与零重排。
