# 对比标的歧义裁决与 Ask Question 工具

## 背景

`comparisons_write` 在代码命中多个标的时（如 `000012` 同时是南玻A / 国债指数）不得替用户裁决。同时，候选字段必须是 create 能直接接收的路由字段，否则模型在澄清后仍无法重试。

## 决策

1. **歧义不是错误，是待裁决状态**。`ComparisonCommands.create()` 返回判别联合：`added | ambiguous`。歧义时不写入任何状态，工具以成功结果返回 `{ status: "ambiguous", candidates }`。
   - 不抛错的原因：歧义需要用户操作，不是一次可重试的失败；放在成功结果里，模型只需看 `status`。
2. **候选只包含可回传的路由字段**：`symbol / exchange / source / instrumentType`，外加展示用 `name`；不再返回 `id`。`instrumentType` 未归一化时字段直接省略。
3. **裁决策略收归 `ComparisonCommands`**（唯一写原语）。`resolveInstrument` 只汇报候选，不再挑首项。
4. **`ask_user` 是阻塞式运行时工具**（`packages/agent-runtime/src/tools/ask-user-tool.ts`）：runtime 定义 schema 与结果协议，宿主（`AgentHost`）负责经协议回路由到发起页渲染，并挂起/应答生命周期（协议事件 `tool.question.required` / `tool.question.resolved`）。
   - 工具声明 `presentation: 'question'`，宿主在调用所在位置渲染卡片，同一调用不再出现折叠工具行；答完折叠成一行「已选择：…」。
   - option 的 `value` 是候选的路由键（例如 `tdx|SZSE|stock`），模型据此回填 create。
   - 取消是正常结果：用户点「跳过」时工具返回 `{status:'cancelled'}`，不是失败。
5. **一次提问只结算一次**。宿主回答请求时就地占据待答表；页面应答、用户取消与运行中止都收敛到同一次请求应答。
6. **系统提示词硬约束**：工具结果报 `status:"ambiguous"` 时必须调用 `ask_user`，每个候选一个选项，禁止猜测或重试。

## 备选与否决

- UI 层拦截歧义：core 工具入口是 Agent 与用户共用的（Agent 即用户原则），裁决逻辑放 UI 会随宿主数量复制。
- 让模型自己带 `instrumentType` 消歧：`instrumentType` 过滤保留为“可用时精确定位”，命中多标的时最终仍交给用户。
- 返回 `id` 让模型引用：create 不接受内部 id，候选与入参不一致会直接导致重试失败。

## 影响文件

- `packages/core/src/engine/data/comparisonCommands.ts`
- `packages/core/src/engine/chart/impl/chart.ts`（解析装配）
- `packages/core/src/features/agent/tools/impl/comparisons.ts`、`features/agent/impl/chartToolDeps.ts`
- `packages/agent-runtime/src/tools/ask-user-tool.ts`
- `packages/vue/src/features/agent/`（bridge 挂起/应答、session、QuestionCard、reducer）
