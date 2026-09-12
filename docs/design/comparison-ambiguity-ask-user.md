# 对比标的歧义裁决与 Ask Question 工具

## 背景

`comparison_create` 在代码命中多个标的时（如 `000012` 同时是南玻A / 国债指数）静默选择第一个候选，用户得到错误标的且无从察觉。同时 `comparison_create` 的 schema 缺少 `assetClass`，即使模型知道意图也无法表达。

## 决策

1. **歧义不是错误，是待裁决状态**。`ComparisonCommands.create()` 返回判别联合：`added | ambiguous`。歧义时不写入任何状态，工具以成功结果返回候选列表 JSON（`{status:'ambiguous', candidates}`）。
   - 不抛错的原因：`PiRunDriver.recoverableToolFailure` 对非 `AgentRuntimeError` 只保留 `code+message`，结构化 `details` 会丢失，模型看不到候选。
2. **裁决策略收归 `ComparisonCommands`**（唯一写原语）。`chart.ts` 的 `resolveInstrument` 只汇报全部 `candidates`，不再挑首项；`core` 层没有任何替用户拍板的逻辑。
3. **`ask_user` 是阻塞式运行时工具**（`packages/agent-runtime/src/tools/ask-user-tool.ts`）：runtime 定义 schema 与结果协议，宿主（`BrowserAgentBridge`）负责渲染卡片和挂起/应答生命周期（协议事件 `tool.question.required` / `tool.question.resolved`，`AGENT_UI_PROTOCOL_VERSION` 升至 6）。
4. **等待用户答复不计入 run deadline**。deadline 本质是无活动计时器；新增 `RuntimeToolDefinition.waitsForUserInput` 标志，驱动器在该工具执行期间停表（引用计数支持并行），答复后重满一个窗口。默认 deadline 从 30s 提到 10min。
   - 否决心跳方案：心跳把"等待"伪装成"活动"，是时序耦合；停表是声明式的。
5. **系统提示词硬约束**：工具结果报 `status:"ambiguous"` 时必须调用 `ask_user`，每个候选一个选项，禁止猜测或重试。

## 备选与否决

- UI 层拦截歧义：core 工具入口是 Agent 与用户共用的（Agent 即用户原则），裁决逻辑放 UI 会随宿主数量复制。
- 让模型自己带 `assetClass` 消歧：`assetClass` 过滤保留为"可用时精确定位"，但命中多标的时最终仍交给用户。

## 影响文件

- `packages/core/src/engine/chart.ts`、`engine/data/comparisonCommands.ts`（歧义返回与过滤）
- `packages/core/src/data/provider/types.ts`（`ASSET_CLASS_VALUES` 单一来源）
- `packages/agent-runtime/src/tools/ask-user-tool.ts`、`pi/pi-run-driver.ts`、`pi/types.ts`、`contracts/ui.ts`、`provider-openai-compatible/runtime.ts`
- `packages/vue/src/features/agent/`（bridge 挂起/应答、`QuestionCard.vue`、reducer、fake bridge 脚本）
