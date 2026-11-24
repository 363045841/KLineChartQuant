# Indicators 指标模块

`packages/core/src/engine/indicators/` 负责指标目录、计算计划、异步执行和渲染投影。
计算结果由 `IndicatorResultStore` 按 `calculationKey` 保存。图表按 `instanceId` 展开结果，renderer 在帧内通过 `IndicatorRenderStateReader.get(instanceId)` 读取投影。

内置逐 bar 指标位于 Script 包（`packages/script/scripts/*.ts`）。主行情、分时均价、最新价线等系统绘制由图表视图注册为 Layer。

完整契约见
[`docs/design/indicator/indicator-instance-state.md`](../../../../../docs/design/indicator/indicator-instance-state.md)
与
[`docs/design/indicator/indicator-instance-render-binding.md`](../../../../../docs/design/indicator/indicator-instance-render-binding.md)。

## 模块边界

```text
StateKernel.data + StateKernel.indicator（配置 SSOT）
  -> RuntimeProjectionCoordinator
  -> ChartIndicatorManager.projectIndicators（同步计算器，发布实例快照）
  -> CalculationPlan（按 calculationKey 去重）
  -> IndicatorCalculationScheduler（合并输入、执行、发布）
  -> 任务输出按 calculationKey 写入 IndicatorResultStore
  -> 按 instanceId 展开为 IndicatorSeriesPool
  -> composeInstanceRenderState（逐 instanceId 生成投影）
  -> createRenderStateReader().get(instanceId)
  -> engine/renderers/Indicator
```

本目录负责：

- 注册指标元数据、运行时计算端口、renderer 和状态投影规则。
- 以 `calculationKey` 生成去重计划和保存计算结果，按 `instanceId` 分发给图表。
- 委派注册定义计算，并处理过期请求与错误；Script Worker 由 Script 服务管理。
- 把结果池按 `instanceId` 投影为帧级渲染状态，并注册实例相关插件服务。
- 管理主图/副图实例及其与 pane 布局的协作。

本目录不负责：

- 指标图形、坐标轴和图例的实际绘制；它们位于 `engine/renderers/Indicator/`。
- 调整 Canvas、WebGL 或 WebGPU 的帧边界；由 `ChartRenderer` 与 `rendering/` 负责。
- 将内部计算对象直接提供给 Controller 或 Agent；公开查询必须基于已提交结果构造受限 DTO。
- 保存图表配置。窗格、指标实例和参数由 StateKernel 持有。

## 目录结构

```text
indicators/
├── chartIndicatorManager.ts     # 计算器同步、实例与图层投影、调度接线
├── indicatorMetadata.ts         # 指标定义契约与运行时描述符
├── registerBuiltins.ts          # 内置指标定义装配
├── stateComposer.ts             # 按 instanceId 的渲染状态投影（composeInstanceRenderState 等）
├── instances/                   # 实例快照、计算计划、执行与投影，分层见其 README
└── __tests__/                   # 注册、调度与投影测试；技术指标算法在 Script 包测试
```

`instances/` 内部按 `domain / api / execution / assembly` 分层，依赖方向单向向下，
详细职责见 [`instances/README.md`](./instances/README.md)。

## 身份模型

四个标识职责不同，不能混用：

| 标识              | 含义                                       | 是否进入 calculator |
| ----------------- | ------------------------------------------ | ------------------- |
| `definitionId`    | 指标定义类型，例如内置脚本 `MACD`、`RSI`   | 是（解析 metadata） |
| `instanceId`      | 图表上的一次启用实例                       | 否                  |
| `calculationKey`  | `definitionId + 计算参数 + 计算上下文`     | 是（去重身份）      |
| `paneId`          | 实例所在绘图区的布局身份                   | 否                  |

同一 `definitionId` 可以有多个 `instanceId`，各自使用独立参数计算。`calculationKey` 不含 `paneId`、
样式或 `instanceId`，因此同一组参数放在两个 pane 只计算一次，但仍是两个独立实例，拥有各自的渲染投影。
渲染只认 `instanceId`，`paneId` 只决定投影落在哪个 pane，不参与状态寻址。

## 计算与提交

`Kernel.indicator` 是 UI 与持久化的配置来源。`RuntimeProjectionCoordinator` 提交指标阶段时调用 `projectIndicators`，先同步图表执行器的计算器，再从已装配定义和实例配置构造完整计算计划，挂载图层后启动调度。`instanceId` 和 `paneId` 来自配置，计算用的 `definitionId` 取定义的 `metadata.name`。只有声明了 `runtime` 的定义进入计算计划。

每次计算按以下规则执行：

1. 从当前实例快照构造 `CalculationPlan`，相同 `calculationKey` 的实例合并为一个任务。
2. `IndicatorCalculationScheduler.refresh` 把任务合并进 lane：运行中的任务不因行情更新被取消，只替换尚未开始的待执行项；行情更新期间保持“一项运行 + 一项最新待执行”。
3. 执行器对每个去重任务调用定义的计算端口，产出 `IndicatorSeriesOutput`。
4. 结果按 `calculationKey` 写入 `IndicatorResultStore`，由 `snapshot(plan)` 展开为按 `instanceId` 索引的 `IndicatorSeriesPool`。
5. 读取方以 `dataRevision + marketRevision` 判断结果是否有效；失败作为带 `error` 的结果提交，不切换执行链路。

分时视图下结果池会先按 `displayTimestamps` 投影到展示时间轴，再生成渲染状态。

Agent 的 `indicator_series_query` 通过同一个调度器的 `submit` 提交预览计算：同一身份复用已发布结果或正在运行的任务，结果进入同一仓库，但不进入图表结果池。

指标定义把计算输入放在 `runtime.defaultInputs`，把 `show*` 等展示开关放在
`presentation.defaultOptions`。展示变更只重建 `renderStates`，不触发计算。多序列指标始终计算
完整结果，逐线显隐由 Plot 声明的 `show` 输入在投影阶段解析。

## 结果池与投影

`IndicatorSeriesPool.results` 是当前计算计划按 `instanceId` 展开的结果视图。每份结果带有自己的计算时间轴，因此重算期间不同结果可以来自不同的行情快照。

`IndicatorResult` 只承载计算结果本身：`timestamps`、`dataRevision`、`marketRevision`、`series` 与可选的 `error`。
实例身份由结果池的键承担，计算身份由仓库的键承担，不在结果里重复。

`stateComposer.ts` 的 `composeInstanceRenderState(metadata, result, inputs, presentation, visibleRange, timestamp, colors)`
逐实例把结果投影为公共 Plot 状态：实例输入与展示配置合入 renderer 读取的 `params`，Plot 投影由
`plots/impl/projectPlots.ts` 完成；未声明 `plots` 的定义不产生渲染状态。
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

## 服务注册

`ChartIndicatorManager` 向 PluginHost 注册两个实例相关服务，服务键定义在
`instances/api/indicatorRenderBinding.ts`：

- `INDICATOR_INSTANCE_STATE_SERVICE`：值为 `IndicatorRenderStateReader`，renderer 按 `instanceId` 读取投影。
- `INDICATOR_INSTANCE_CATALOG_SERVICE`：值为 `IndicatorInstanceCatalog`，主图图例按实例枚举并读取标题。

## 新增或修改指标

1. 指标统一写在 Script 包：在 `packages/script/scripts/` 新增 `defineIndicator` 文件，数值测试也放在 Script 包。
2. 中立定义经 Core 适配器补齐计算、Plot 渲染与标题能力，直接产出定义对象交给注册表，不再经过装饰器或定义类。
3. 定义声明 `category`、`defaultPaneId`、`rendererFactory`、`dataViews`；需要计算时再补 `runtime` 与 `plots`。
4. 在 `engine/renderers/` 实现绘制；通过注入的 `instanceId` 读取帧级投影，不持有计算缓存。
5. 覆盖注册、调度、结果池展开和渲染投影测试。

系统绘制（主行情、最新价线、价格标签、极值标记）由图表视图声明并直接注册为 Layer，不属于指标定义。

## 测试

核心测试位于本目录 `__tests__/`：

- `pipeline/__tests__/indicatorPipeline.test.ts`：目录注册、懒加载和提交契约。
- `controllers/__tests__/indicatorOnDemand.test.ts`：恢复布局、目录同步与渲染结果读取。
- `indicatorInstancePipeline.test.ts`：整批计划发布与展示更新。
- `indicatorCalculationScheduler.test.ts` / `indicatorCalculator.test.ts`：去重计划、请求门控与结果池展开。
- `stateComposer.test.ts`：实例结果到 Plot 状态的投影。
- `projection/`：计算时间轴到展示时间轴的投影。

指标数值测试位于 Script 包。运行 Core 指标相关测试：

```bash
pnpm --filter @363045841yyt/klinechart-core test
```
