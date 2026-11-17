# 对比标的歧义裁决与 Ask Question 工具

## 背景

`comparisons_write` 在代码命中多个标的时（如 `000012` 同时是南玻A / 国债指数）静默选择第一个候选，用户得到错误标的且无从察觉。同时 `comparisons_write` 的 schema 缺少 `instrumentType`，即使模型知道意图也无法表达。

## 决策

1. **歧义不是错误，是待裁决状态**。`ComparisonCommands.create()` 返回判别联合：`added | ambiguous`。歧义时不写入任何状态，工具以成功结果返回候选列表 JSON（`{status:'ambiguous', candidates}`）。
   - 不抛错的原因：`PiRunDriver.recoverableToolFailure` 对非 `AgentRuntimeError` 只保留 `code+message`，结构化 `details` 会丢失，模型看不到候选。
2. **裁决策略收归 `ComparisonCommands`**（唯一写原语）。`chart.ts` 的 `resolveInstrument` 只汇报全部 `candidates`，不再挑首项；`core` 层没有任何替用户拍板的逻辑。
3. **`ask_user` 是阻塞式运行时工具**（`packages/agent-runtime/src/tools/ask-user-tool.ts`）：runtime 定义 schema 与结果协议，宿主（`BrowserAgentBridge`）负责渲染与挂起/应答生命周期（协议事件 `tool.question.required` / `tool.question.resolved`，`AGENT_UI_PROTOCOL_VERSION` 升至 6）。
   - 工具声明 `presentation: 'question'`，宿主在调用所在位置渲染卡片，同一调用不再出现折叠工具行；答完折叠成一行「已选择：…」。
   - 取消是正常结果：用户点「跳过」时工具返回 `{status:'cancelled'}`，不是失败；否则模型会把「没人回答」当成需要重试的错误。
4. **一次提问只结算一次**。挂起表 `BrowserPendingQuestions` 独占答复、取消与运行中止三条路径，都收敛到同一个 `settle`；Bridge 只转发事件，不持有结算状态。
5. **系统提示词硬约束**：工具结果报 `status:"ambiguous"` 时必须调用 `ask_user`，每个候选一个选项，禁止猜测或重试。

## 备选与否决

- UI 层拦截歧义：core 工具入口是 Agent 与用户共用的（Agent 即用户原则），裁决逻辑放 UI 会随宿主数量复制。
- 让模型自己带 `instrumentType` 消歧：`instrumentType` 过滤保留为"可用时精确定位"，但命中多标的时最终仍交给用户。

## 影响文件

- `packages/core/src/engine/chart.ts`、`engine/data/comparisonCommands.ts`（歧义返回与过滤）
- `packages/core/src/data/provider/types.ts`（`INSTRUMENT_TYPES` 单一来源）
- `packages/agent-runtime/src/tools/ask-user-tool.ts`、`pi/types.ts`、`pi/impl/run.ts`、`contracts/ui.ts`、`provider-openai-compatible/runtime.ts`
- `packages/vue/src/features/agent/`（bridge 挂起/应答、`session/impl/browser-pending-questions.ts`、`components/QuestionCard.vue`、`components/impl/ask-user-view.ts`、reducer、fake bridge 脚本）
