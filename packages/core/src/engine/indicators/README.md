# Indicators 指标模块

`packages/core/src/engine/indicators/` 负责技术指标的注册、实例管理、异步计算、结果池提交和可见范围投影。
它位于行情数据与指标 renderer 之间：消费 StateKernel 的实例配置快照，计算结果保存在按 `instanceId` 索引的
实例结果池；renderer 只在帧内通过 `IndicatorRenderStateReader.get(instanceId)` 读取已提交的渲染投影，
不直接依赖 Worker 或 PluginHost。

完整契约见
[`docs/design/indicator-instance-render-binding.md`](../../../../../docs/design/indicator-instance-render-binding.md)
与
[`docs/design/indicator-instance-calculation-migration.md`](../../../../../docs/design/indicator-instance-calculation-migration.md)。

## 模块边界

```text
StateKernel.data + StateKernel.indicator（配置 SSOT）
  -> ChartIndicatorManager（把 Kernel 实例单向投影为计算实例）
  -> IndicatorCalculationPlan（按 calculationKey 去重）
  -> IndicatorCalculationExecutor（Worker 优先，失败降级 inline）
  -> 任务输出展开为 instanceId 结果池（IndicatorResultPool）
  -> composeInstanceRenderState / composeVolumeRenderState（逐 instanceId 生成投影）
  -> createRenderStateReader().get(instanceId)
  -> engine/renderers/Indicator
```

本目录负责：

- 注册指标元数据、运行时 calculator、renderer 和状态投影规则。
- 以 `calculationKey` 为去重身份生成计算计划，以 `instanceId` 保存计算结果。
- 选择 Worker 或 inline 执行器，并处理过期请求、错误和降级。
- 把结果池按 `instanceId` 投影为帧级渲染状态，并注册实例相关插件服务。
- 管理主图/副图实例及其与 pane 布局的协作。

本目录不负责：

- 指标图形、坐标轴和图例的实际绘制；它们位于 `engine/renderers/Indicator/`。
- 调整 Canvas、WebGL 或 WebGPU 的帧边界；由 `ChartRenderer` 与 `rendering/` 负责。
- 将内部计算对象直接提供给 Controller 或 Agent；公开查询必须基于已提交结果构造受限 DTO。
- 维护指标的业务事实源副本；业务结果唯一事实源是按 `instanceId` 索引的实例结果池。

## 目录结构

```text
indicators/
├── chartIndicatorManager.ts     # 指标实例和副图 pane 的高层业务操作、执行器选择、服务注册与渲染投影
├── indicatorRuntime.ts          # Worker 端 computeKey → calculator 映射（CALCULATOR_MAP / createWorkerCompute）
├── indicatorMetadata.ts         # 指标定义契约与运行时描述符
├── indicatorDefinitionRegistry.ts # 内置/扩展定义的全局声明注册表与别名解析（@Indicator 装饰器）
├── registerBuiltins.ts          # 内置指标定义装配
├── stateComposer.ts             # 按 instanceId 的渲染状态投影（composeInstanceRenderState 等）
├── visibleStateComposers.ts     # 可见区极值、padding、latestValues 等派生投影
├── instances/                   # 实例优先指标链路（CRUD、计算计划、执行、投影），分层见其 README
├── calculators/                 # 纯计算函数，不读取 Chart、DOM 或 PluginHost
├── state/                       # 各指标 renderer 所需的状态类型与 EMPTY_* 常量
└── __tests__/                   # 注册、调度、投影和 calculator 测试
```

`instances/` 内部按 `domain / api / execution / worker / assembly` 分层，依赖方向单向向下，
详细职责见 [`instances/README.md`](./instances/README.md)。

## 身份模型

四个标识职责不同，不能混用：

| 标识              | 含义                                       | 是否进入 calculator |
| ----------------- | ------------------------------------------ | ------------------- |
| `definitionId`    | 指标定义类型，例如 `MACD`、`RSI`           | 是（解析 metadata） |
| `instanceId`      | 图表上的一次启用实例                       | 否                  |
| `calculationKey`  | `definitionId + 计算参数 + 计算上下文`     | 是（去重身份）      |
| `paneId`          | 实例所在绘图区的布局身份                   | 否                  |

同一 `definitionId` 可以有多个 `instanceId`，各自使用独立参数计算。`calculationKey` 不含 `paneId`、
样式或 `instanceId`，因此同一 `MA(20)` 放在两个 pane 只计算一次，但仍是两个独立实例，拥有各自的渲染投影。
渲染只认 `instanceId`，`paneId` 只决定投影落在哪个 pane，不参与状态寻址。

## 计算与提交

`Kernel.indicator`（`indicatorState`）是 UI 与持久化的配置 SSOT。`ChartIndicatorManager` 在每个状态 effect
中把 Kernel 实例单向投影为 `instances/` 的计算实例：`instanceId`、`paneId` 原样保留，`definitionId` 取静态
定义注册表的 `metadata.name`；没有 `runtime` 的展示型指标（如成交量）不进入计算链路。

每次计算按以下规则执行：

1. 从当前实例快照构造 `IndicatorCalculationPlan`，相同 `calculationKey` 的实例合并为一个任务。
2. `createInstanceCalculationScheduler` 记录 `requestId`，优先用模块 Worker 执行器，构造失败或异步失败时
   切换为 inline 执行器并重试当前数据。
3. 执行器对每个去重任务调用 calculator，产出 `IndicatorCalculationOutput`。
4. `expandIndicatorCalculationOutputs` 把任务输出展开为按 `instanceId` 索引的 `IndicatorResultPool`。
5. 仅当 `requestId` 仍是最新、且实例 `calculationRevision` 未变化时提交；过期响应被丢弃，inline 再失败只记录日志。

分时视图下结果池会先按 `displayTimestamps` 投影到展示时间轴，再生成渲染状态。

指标定义把 calculator 参数放在 `runtime.defaultParams`，把 `show*` 等展示开关放在
`presentation.defaultOptions`。展示变更只重建 `renderStates`，不触发计算。MA、RSI 等多序列指标始终计算
完整结果，可见序列由 `presentation.selectSeriesKeys` 在投影阶段选择。

## 结果池与投影

`IndicatorResultPool` 的关键字段：

- `timestamps`：与 bar 对齐序列下标严格一致的行情时间轴。
- `results`：`Map<instanceId, IndicatorSeriesResult>`，图表与 Agent 共享的业务结果事实源。
- `dataRevision` / `instanceRevision`：结果对应的行情版本与实例计算版本。

`stateComposer.ts` 的 `composeInstanceRenderState(metadata, result, visibleRange, timestamp)` 逐实例把结果
投影为 renderer 状态：优先使用 `mainPane.composeRenderState`，否则使用 `visibleState.compose`。
`visibleStateComposers.ts` 提供基于当前可见范围的极值、padding 等通用 composer。成交量没有 calculator，
其渲染状态由 `composeVolumeRenderState` 直接合成，按 Kernel 成交量实例的 `instanceId` 写入投影。

提交完成后 `renderStates` 是按 `instanceId` 索引的只读投影；可见范围变化只重算投影，不触发 Worker，
也不改变业务结果版本。

## Renderer 协作

`ChartIndicatorManager.createRenderStateReader()` 返回绑定当前已提交快照的帧级读取器：

```ts
interface IndicatorRenderStateReader {
  get<T = unknown>(instanceId: string): T | undefined
}
```

指标 renderer 与 scale renderer 在创建时注入自己的 `instanceId`，绘制时只读取该实例的投影，
不再通过 `resolveStateKey` 推导 key，也不向 PluginHost StateStore 写入或读取指标事实状态。
`ChartRenderer` 在每帧开始时创建 reader 并通过 RenderContext 传入，使同一帧全部 renderer 看到同一份投影。

指标定义变更不能作为参数 patch，`syncPipeline` 采用「删建」，保证 `definitionId` 与计算身份一致。

`outputAlignment` 的语义：

- `bar`：输出序列与 K 线下标对齐，可从 `firstReadyIndex` 识别 warm-up 区间。
- `aggregate`：输出不按单根 K 线对齐，例如 Structure、Zones、Volume Profile；其
  `firstReadyIndex` 为 `null`。

## 服务注册

`ChartIndicatorManager` 向 PluginHost 注册两个实例相关服务，服务键定义在
`instances/api/indicatorRenderBinding.ts`：

- `INDICATOR_INSTANCE_STATE_SERVICE`：值为 `IndicatorRenderStateReader`，renderer 按 `instanceId` 读取投影。
- `INDICATOR_INSTANCE_CATALOG_SERVICE`：值为 `IndicatorInstanceCatalog`，主图图例按实例枚举并读取标题。

## 新增或修改指标

1. 在 `calculators/` 编写纯计算函数；输入为行情与已解析参数，不能依赖 Chart、DOM 或全局渲染状态。
2. 在 `state/` 定义 renderer 状态类型与 `EMPTY_*` 常量。
3. 在内置定义装配中声明 `IndicatorMetadata`：类别、默认 pane、renderer factory、runtime descriptor、
   `outputAlignment` 与 `visibleState.compose`。
4. 为需要可见范围缩放的指标补充或复用 `visibleStateComposers.ts` 中的 composer。
5. 在 `engine/renderers/Indicator/` 实现绘制；通过注入的 `instanceId` 读取帧级投影，不持有计算缓存。
6. 覆盖 calculator、注册、调度、结果池展开和渲染投影测试。

## 测试

核心测试位于本目录 `__tests__/`：

- `registerBuiltins.test.ts` / `indicatorDefinitionRegistry.test.ts`：内置定义装配、元数据、别名与定义注册。
- `chartIndicatorManager.test.ts`：Kernel 实例投影、调度接线与帧级结果读取。
- `instanceCalculationScheduler.test.ts` / `instanceCalculationRuntime.test.ts`：去重计划、请求门控、降级与结果池展开。
- `stateComposer.test.ts`：逐实例的渲染状态投影。
- 其余按指标命名的测试：各 calculator 的数值和边界条件。

运行 Core 指标相关全量测试：

```bash
pnpm --filter @363045841yyt/klinechart-core test
```
