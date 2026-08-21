# 指标结果接入 Kernel 实现设计

## 1. 文档目的

本文描述指标计算结果从 `IndicatorScheduler` 和 `PluginHost.StateStore` 收敛到
`ChartStateKernel` 的实现方式，并明确以下问题：

- 哪些状态由 Kernel 持有；
- 数据或配置变化后如何触发计算；
- Worker 结果如何通过 Action 原子提交；
- Signal 如何触发重绘；
- Renderer 在什么时机读取结果；
- 如何保证旧结果不会被解释为新数据的计算结果；
- 如何兼容现有 renderer 与独立 `IndicatorScheduler` 使用方式。

本文基于当前工作区已经完成的部分实现编写，不替代
`indicator-result-kernel-state.md`，后者记录简要架构决策，本文负责实现细节、剩余工作和验收标准。

## 2. 当前实现状态

当前工作区已经完成以下主链路：

1. 新增 `indicatorResultState`，保存计算状态、版本、原始 `IndicatorSeriesBundle` 和
   renderer 状态投影。
2. `ChartStateKernel` 已组合 `indicatorResult`，并在 flat signals 中暴露结果快照。
3. `ChartIndicatorManager` 创建 Scheduler 时注入 `kernel.indicatorResult`。
4. Scheduler 开始计算时调用 `beginCalculation()`，计算完成后调用
   `commitResults()`。
5. Scheduler 不再把 Chart 运行路径中的指标结果直接写入 PluginHost `StateStore`。
6. `ChartRenderer` 为每帧创建 `IndicatorRenderStateReader`，renderer 通过
   `RenderContext` 读取绑定快照中的 `renderStates`。
7. 结果提交后 Scheduler 调用 invalidate callback，由 Chart 安排下一帧绘制。
8. 可见范围变化只重建 `renderStates`，不重新执行 Worker，也不增加
   `resultVersion`。

当前链路为：

```text
K 线 / 指标配置变化
  -> IndicatorScheduler.update / updateIndicatorConfig
  -> indicatorResult.actions.beginCalculation
  -> Worker 或 Inline Runtime 计算
  -> Scheduler 校验 requestId、dataVersion、configVersion
  -> composeRenderStates
  -> indicatorResult.actions.commitResults
  -> invalidate callback / scheduleDraw
  -> 下一帧 Renderer 从 RenderContext.indicatorStateReader 读取
  -> 当前帧绑定的 kernel.indicatorResult.snapshot.renderStates
```

## 3. 核心设计原则

### 3.1 Kernel 是指标结果的唯一业务事实源

Kernel 保存外部可观察的计算生命周期和最近成功结果。Scheduler 只保留执行计算所需的
Worker、请求序号、输入快照和临时缓存。

PluginHost `StateStore` 不再是 Chart 内指标结果的事实源。它只保留两类用途：

- 非指标插件自己的共享状态；
- 独立使用 Scheduler 时的兼容投影。

### 3.2 Signal 只负责失效通知

提交 Kernel 状态后发送响应式通知并调用 `scheduleDraw`。Signal 回调中不直接执行
renderer 绘制。

Renderer 在下一帧主动读取最新快照。这里的主动读取是 frame paint 阶段的按需读取，
不是轮询。

### 3.3 一次计算只提交一次完整结果

`bundle`、renderer 投影、成功版本和状态必须通过一次 Action 原子发布。订阅者不能观察到
新 bundle 配旧 render states，或 ready 状态配旧版本的中间态。

### 3.4 计算版本和可见区投影版本分离

可见范围变化不改变指标全量 series，只改变可见极值、标题值等 renderer 投影。因此：

- Worker 计算成功时增加 `resultVersion`；
- 可见范围变化时只增加 `projectionVersion`；
- `resultVersion` 不因滚动或缩放增加。

## 4. 状态模型

实现已将“当前计算尝试”和“最近成功结果”显式分开：

```ts
export interface IndicatorCalculationAttempt {
  readonly status: 'idle' | 'computing' | 'error'
  readonly requestId: number
  readonly dataVersion: number
  readonly configVersion: number
  readonly error: string | null
}

export interface CommittedIndicatorResult {
  readonly dataVersion: number
  readonly configVersion: number
  readonly resultVersion: number
  readonly projectionVersion: number
  readonly bundle: IndicatorSeriesBundle
  readonly renderStates: ReadonlyMap<string, unknown>
}

export interface IndicatorResultSnapshot {
  readonly attempt: IndicatorCalculationAttempt
  readonly committed: CommittedIndicatorResult | null
}
```

语义如下：

- `attempt.status === 'computing'`：新计算进行中，`committed` 仍可用于绘制旧结果；
- `attempt.status === 'error'`：本次计算失败，错误属于 attempt；
- `committed.dataVersion`：bundle 实际基于的数据版本；
- `committed.configVersion`：bundle 实际基于的配置版本；
- `committed === null`：从未成功计算，renderer 不绘制指标；
- 新结果成功后，更新 `committed` 并将 attempt 重置为 idle；
- Agent 只有在 committed 版本与目标数据、配置版本一致时，才把指标标记为 ready。

如果第一阶段不立即调整类型，至少必须补充独立的
`committedDataVersion/committedConfigVersion`，不能让错误状态覆盖 bundle 的来源版本。

## 5. Action 设计

推荐的语义 Action 如下：

```ts
beginCalculation(input: {
  requestId: number
  dataVersion: number
  configVersion: number
}): void

commitResults(input: {
  requestId: number
  dataVersion: number
  configVersion: number
  bundle: IndicatorSeriesBundle
  renderStates: ReadonlyMap<string, unknown>
}): boolean

updateProjection(input: {
  resultVersion: number
  renderStates: ReadonlyMap<string, unknown>
}): boolean

failCalculation(input: {
  requestId: number
  dataVersion: number
  configVersion: number
  error: string
}): boolean

reset(): void
```

`commitResults()` 和 `failCalculation()` 应在 Action 内再次校验当前 attempt 身份。Scheduler
已经有旧结果丢弃检查，但 Kernel Action 仍应防止未来其他调用方误提交过期结果。

返回 `boolean` 表示本次提交是否生效。只有生效时才安排重绘或发送完成通知。

## 6. 计算触发链路

### 6.1 K 线数据变化

`ChartDataManager` 发布新的活动 Buffer 数据后调用 Scheduler：

```text
applyActiveBufferSnapshot
  -> scheduler.update(data, visibleRange)
  -> dataVersion 增加
  -> beginCalculation
  -> Worker / Inline Runtime
```

后续应把 Scheduler 的局部 `dataVersion` 与 Kernel 数据版本关联起来。仅使用 Scheduler 内部
自增版本，可以防止 Worker 乱序，但不能证明指标结果对应 Agent 当前读取的
`kernel.data.activeBuffer`。

推荐由数据快照携带 `dataRevision`：

```ts
interface ActiveBufferSnapshot {
  readonly dataRevision: number
  // existing fields
}
```

Scheduler 使用该 revision 作为 `basedOnDataRevision`，而不是重新生成一套无法与数据状态
比较的编号。

### 6.2 指标实例或参数变化

`kernel.indicator.instances` 是指标实例和参数的 SSOT。投影 effect 检测变化后更新 Scheduler
配置并开始计算：

```text
kernel.indicator.instances changed
  -> ChartIndicatorManager reconcile
  -> scheduler.updateIndicatorConfig
  -> configVersion 增加
  -> beginCalculation
```

长期应由指标实例快照提供 `configRevision`。Scheduler 内部版本仍可保留用于 Worker 协议，
但对外快照应使用可和 Kernel 指标配置对应的 revision。

### 6.3 可见范围变化

可见范围变化只执行：

```text
kernel.viewport.visibleRange changed
  -> Scheduler 从 committed.bundle 重建 renderStates
  -> indicatorResult.actions.updateProjection
  -> scheduleDraw
```

不得重新执行 Worker，也不得改变 committed bundle 的数据或配置版本。

## 7. Renderer 读取机制

### 7.1 采用“通知后下一帧拉取”

正确机制是：

1. Action 提交 Kernel 快照；
2. Signal 通知结果状态变化；
3. Chart 合并重复的失效请求并调用 `scheduleDraw`；
4. Renderer 在下一帧 paint 时读取快照；
5. 同一同步 paint 过程中的 renderer 都读取同一份已提交状态。

不采用以下方式：

- Worker 回调中直接调用 renderer；
- 把完整指标数组作为事件 payload 推送给每个 renderer；
- Renderer 使用定时器轮询 Scheduler；
- Renderer 读取 Scheduler 私有字段。

### 7.2 已完成的帧读取路径

指标 renderer 现在使用：

```ts
context.indicatorStateReader?.get(stateKey)
```

读取器在帧开始时绑定已提交的 `renderStates` 快照，所有 renderer 在同一帧共享同一版本。

### 7.3 最终读取路径

renderer 依赖的窄接口为：

```ts
interface IndicatorRenderStateReader {
  get(stateKey: string): unknown
}
```

该 reader 在 frame context 构建时绑定当前 committed/projection snapshot。这样 renderer 不需要
知道 Kernel，也不会把 PluginHost 误当指标业务状态仓库。

## 8. 不可变性要求

当前 `renderStates` 使用只读 Map 包装，但 `bundle` 和 Map 内对象仍可能包含可变数组或对象。
Kernel 快照必须明确所有权：

- Worker 返回的 bundle 在提交后不得再次修改；
- Inline Runtime 不得复用并原地修改已提交数组；
- `renderStates` 中的对象在提交后不得由 renderer 修改；
- public/Agent 查询不能返回可写的内部数组引用。

第一阶段可通过开发环境冻结和单测约束所有权，避免对大数组执行高成本深拷贝。对外查询层
应返回只读 DTO 或范围切片，不直接暴露完整内部 bundle。

## 9. Agent 读取边界

Agent 不应读取 `renderStates`。该结构以 renderer `stateKey` 为索引，包含可见区极值、标题
数据和渲染专用结构，不是稳定公共协议。

应在 Kernel 结果之上提供只读查询服务：

```ts
getIndicatorValues(input: {
  instanceId: string
  from?: number
  to?: number
  fields?: ReadonlyArray<string>
}): IndicatorValueResult
```

返回值至少包含：

- `instanceId` 与 `indicatorId`；
- 参数快照；
- `basedOnDataRevision`；
- `resultVersion`；
- 时间戳和字段值；
- warm-up 产生的空值；
- `ready/computing/error/stale` 状态。

只有 `committed.dataVersion === kernel.data.activeBuffer.dataRevision` 且配置版本匹配时，查询
结果才是 `ready`。否则可以返回旧值，但必须标记 `stale`，不能冒充当前盘面结果。

## 10. 失败与降级

当前实现已经定义 `failCalculation()`，但 Scheduler 的 Worker error、Inline error 和 fallback
路径尚未完整调用该 Action，必须补齐：

- Worker 返回 error 时记录本次 attempt 失败；
- Worker 初始化失败并成功 fallback 到 Inline 时，新 attempt 覆盖旧错误；
- Inline Runtime 抛错时提交 error，不能让状态永久停在 computing；
- Scheduler 销毁或数据清空时 reset；
- 失败时允许 renderer 继续使用 `committed` 的最后成功结果；
- 失败后的可见区变化仍可基于旧 committed bundle 更新 projection。

错误信息应使用结构化错误码，而不是只保存字符串。至少需要区分 Worker 初始化、Worker
计算、Inline 计算、无效配置和结果转换失败。

## 11. 独立 Scheduler 兼容

独立创建 `IndicatorScheduler` 的测试或外部调用没有 Chart Kernel。当前实现为该场景创建私有
`indicatorResultState`，并在显式注入 PluginHost 时把已提交结果投影回传统 StateStore。

兼容层必须满足：

- 只在 Scheduler 自己拥有 result state 时启用；
- Chart 路径不重复写 PluginHost StateStore；
- destroy 时仅销毁自己创建的 state，不销毁外部注入的 Kernel state；
- 新 API 优先允许显式注入 result state，布尔构造参数只作为迁移兼容保留。

## 12. 实施步骤

### 阶段 A：完成当前主链路

- [x] 新增 `indicatorResultState`。
- [x] 接入 `ChartStateKernel`。
- [x] Scheduler 使用 Action 提交计算结果。
- [x] PluginHost resolver 从 Kernel 读取 renderer 投影。
- [x] 结果提交后安排下一帧绘制。
- [x] 补齐 Worker 和 Inline 失败路径的 `failCalculation()`。
- [x] 分离失败 attempt 与上次成功 bundle 的版本。
- [x] 为 Action 增加过期提交防护。

### 阶段 B：关联数据和配置 revision

- [x] 为活动数据快照增加 `dataRevision`。
- [x] 为指标实例/配置快照增加 `configRevision`。
- [x] Scheduler 使用 Kernel revision 作为结果来源身份。
- [x] 增加 `ready/stale` 一致性判断。

### 阶段 C：收紧 Renderer 边界

- [x] 为 frame context 增加 `IndicatorRenderStateReader`。
- [x] renderer 从 frame 绑定快照读取，不再直接依赖 PluginHost resolver。
- [x] 删除 Chart 路径中的指标 StateStore 兼容逻辑。
- [x] 保留非指标插件 StateStore。

### Pre-D：建立指标实例结果池

- [x] 从 `indicatorState.instances` 获取稳定实例身份和参数快照。
- [x] Worker 与 Inline 按实例参数独立调用既有 calculator。
- [x] 原子提交 `timestamps`、按 `instanceId` 索引的结果和 revision。
- [x] 定义 bar/aggregate 输出对齐与 `firstReadyIndex` warm-up 语义。
- [x] 失败保留最近成功结果，过期提交不覆盖当前 attempt。
- [x] renderer 继续通过帧级 `IndicatorRenderStateReader` 读取 legacy 投影。

详细决策见 `docs/design/indicator-instance-result-pool.md`。

### 阶段 D：增加稳定查询模型

- [ ] 建立独立指标查询层，支持按指标定义和按 `instanceId` 查询。
- [ ] 支持未添加指标的无副作用临时计算，并与正式结果复用保持相同返回协议。
- [ ] 定义字段名、时间戳、warm-up、空值和数据形态语义。
- [ ] 限制单次查询范围，避免 Agent 拉取无界数组。
- [ ] ChartController 暴露稳定指标查询 DTO，Agent runtime 独立适配且不反向耦合查询层。

详细产品需求见 `docs/design/indicator-query-prd.md`。

## 13. 测试要求

### State 测试

- begin、commit、fail、reset 均发布完整不可变快照；
- 旧 request 不能覆盖新 attempt；
- 失败保留旧 committed 结果及其原始版本；
- projection 更新不增加 resultVersion；
- projectionVersion 单调递增；
- 外部不能修改 Map、bundle 和 render state。

### Scheduler 测试

- Worker 与 Inline 路径提交相同状态形状；
- 过期 requestId、dataVersion、configVersion 被丢弃；
- Worker error 和 Inline throw 不会永久保持 computing；
- fallback 不重复提交成功结果；
- visible range 变化不执行 Worker；
- 外部注入 result state 时 Scheduler destroy 不重置 Kernel。

### Renderer 集成测试

- commit 前 renderer 读取旧 committed 结果；
- commit 后只在下一帧读取新结果；
- 同一帧多个 renderer 读取同一 result/projection version；
- 指标 renderer 不读取 PluginHost，非指标插件仍可读取 StateStore；
- Chart 路径不再产生指标 StateStore 双写。

### Agent 查询测试

- 数据与指标 revision 一致时返回 ready；
- 新数据到达但指标未完成时返回 computing 或 stale；
- 计算失败时返回错误及旧结果版本，不把旧结果标为 ready；
- 查询按 instanceId 区分相同指标的不同 pane 实例。

## 14. 完成标准

满足以下条件后，指标结果接入 Kernel 才算完成：

1. Scheduler 不再持有作为业务事实源的 `latestResult`。
2. Chart 内 renderer 不再从 PluginHost StateStore 获取指标事实状态。
3. 所有成功和失败计算都对应一个可观察且版本明确的 Kernel 状态。
4. Renderer 只由状态失效安排绘制，并在下一帧读取已提交快照。
5. 数据、指标配置和计算结果之间可以通过 revision 判断一致性。
6. Agent 通过稳定查询 DTO 读取结果，不依赖 bundle 或 render state 内部结构。
7. Worker、Inline、可见区更新、失败降级和独立 Scheduler 场景均有测试覆盖。
