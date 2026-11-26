# Indicators 指标模块

`packages/core/src/engine/indicators/` 负责指标目录、定义装配、实例快照与渲染投影。
计算本身不在本目录：行情快照与计算请求交给 `engine/calculation/` 的 `CalculationHub` 调度，`ChartIndicatorManager` 只是它的消费者。

内置逐 bar 指标位于 Script 包（`packages/script/scripts/*.ts`）。主行情、分时均价、最新价线等系统绘制由图表视图注册为 Layer。

完整契约见
[`docs/design/indicator/indicator-instance-state.md`](../../../../../docs/design/indicator/indicator-instance-state.md)
与
[`docs/design/indicator/indicator-instance-render-binding.md`](../../../../../docs/design/indicator/indicator-instance-render-binding.md)。

## 模块边界

```text
StateKernel.data + StateKernel.indicator（配置 SSOT）
  -> RuntimeProjectionCoordinator
  -> ChartIndicatorManager.projectIndicators（同步定义、发布实例计划）
  -> CalculationRequest（definitionId + inputs + context）
  -> CalculationHub（按 calculationKey 去重、排队与提交）
  -> CalculationDefinition.compute（由会话级定义仓库装配）
  -> onCommit(results)
  -> composeInstanceRenderState（逐 instanceId 生成投影）
  -> createRenderStateReader().get(instanceId)
  -> engine/renderers/Indicator
```

本目录负责：

- 注册指标元数据、运行时计算端口、renderer 和状态投影规则。
- 从完整实例快照生成计算请求，把请求计划交给计算中枢，并按提交结果更新投影。
- 把结果按 `instanceId` 投影为帧级渲染状态，并注册实例相关插件服务。
- 管理主图/副图实例及其与 pane 布局的协作。

本目录不负责：

- 指标图形、坐标轴和图例的实际绘制；它们位于 `engine/renderers/Indicator/`。
- 计算去重、排队、取消与结果提交；由 `engine/calculation/` 的 `CalculationHub` 负责。
- 调整 Canvas、WebGL 或 WebGPU 的帧边界；由 `ChartRenderer` 与 `rendering/` 负责。
- 将内部计算对象直接提供给 Controller 或 Agent；公开查询必须基于已提交结果构造受限 DTO。
- 保存图表配置。窗格、指标实例和参数由 StateKernel 持有。

## 目录结构

```text
indicators/
├── chartIndicatorManager.ts     # 实例计划、计算请求、结果提交与图层投影
├── indicatorMetadata.ts         # 指标定义契约与运行时描述符
├── registerBuiltins.ts          # 内置指标定义装配
├── stateComposer.ts             # 按 instanceId 的渲染状态投影（composeInstanceRenderState 等）
├── pipeline/                    # 目录注册管线（collect -> compile -> register）
├── projection/                  # 计算时间轴到展示时间轴的投影
├── instances/                   # 实例身份、领域结果与计算定义装配，分层见其 README
└── __tests__/                   # 注册、状态投影与周期可见性测试；技术指标算法在 Script 包测试
```

`instances/` 内部按 `domain / api / assembly` 分层，详细职责见
[`instances/README.md`](./instances/README.md)。

## 身份模型

四个标识职责不同，不能混用：

| 标识             | 含义                                         | 是否进入计算请求 |
| ---------------- | -------------------------------------------- | ---------------- |
| `definitionId`   | 指标定义类型，例如内置脚本 `MACD`、`RSI`     | 是（解析 metadata） |
| `instanceId`     | 图表上的一次启用实例                         | 否               |
| `calculationKey` | `definitionId + 计算参数 + 计算上下文`       | 是（去重身份）   |
| `paneId`         | 实例所在绘图区的布局身份                     | 否               |

同一 `definitionId` 可以有多个 `instanceId`，各自使用独立参数计算。`calculationKey` 不含 `paneId`、
样式或 `instanceId`，因此同一组参数放在两个 pane 只计算一次，但仍是两个独立实例，拥有各自的渲染投影。
渲染只认 `instanceId`，`paneId` 只决定投影落在哪个 pane，不参与状态寻址。

`calculationKey` 由 `createLocalCalculationKey` 生成；计算中枢再拼接 feed 身份，得到跨行情唯一的全局结果键。

## 计算与提交

`Kernel.indicator` 是 UI 与持久化的配置来源。`RuntimeProjectionCoordinator` 提交指标阶段时调用
`projectIndicators`，先同步图表已装配的定义，再从实例配置生成完整计算计划并挂载图层。
只有声明了 `runtime` 的定义进入计算请求；纯渲染型指标只产生图层。

计算请求只包含定义身份、参数与上下文：

1. `ChartIndicatorManager` 把实例参数与 `runtime.defaultInputs` 合成首个完整输入快照。
2. `CalculationHub` 按 `calculationKey` 合并同一份行情上的相同请求；运行中的任务不因行情更新被取消，
   队列只保留最新一版待执行。
3. 执行器调用 `CalculationDefinition.compute`；有状态定义通过 `createCompute` 建立独立计算会话。
4. 结果按 `dataRevision + marketRevision` 判断有效性，提交给该行情上的全部消费者。
5. 失败作为带 `error` 的结果提交，不切换执行链路。

`request.*` 取数由会话级计算行情（`IndicatorBarsRepository`）按需补历史，并在需求释放后回收 Buffer。

Agent 的 `indicator_series_query` 通过 `CalculationHub.submit` 提交预览计算：同一身份复用已发布结果或
正在运行的任务，结果不进入任何图表的提交快照。

## 结果与投影

`CalculationResult` 承载一次计算本身：`key`、`definitionId`、`timestamps`、`dataRevision`、
`marketRevision`、`series`、`alerts` 与可选的 `error`。结果身份由计算中枢与消费者计划共同承担，
不在结果里重复保存 `instanceId`。

`stateComposer.ts` 的
`composeInstanceRenderState(metadata, result, inputs, presentation, visibleRange, timestamp, colors)`
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

`ChartIndicatorManager` 向 PluginHost 注册实例相关服务，服务键定义在
`instances/api/indicatorRenderBinding.ts`：

- `INDICATOR_INSTANCE_STATE_SERVICE`：值为 `IndicatorRenderStateReader`，renderer 按 `instanceId` 读取投影。
- `INDICATOR_INSTANCE_CATALOG_SERVICE`：值为 `IndicatorInstanceCatalog`，主图图例按实例枚举并读取标题。
- `INDICATOR_AVAILABILITY_SERVICE`：异步数据源上报的实例加载状态。

## 新增或修改指标

1. 指标统一写在 Script 包：在 `packages/script/scripts/` 新增 `defineIndicator` 文件，数值测试也放在 Script 包。
2. 中立定义经 Core 适配器补齐计算、Plot 渲染与标题能力，直接产出定义对象交给注册表，不再经过装饰器或定义类。
3. 定义声明 `category`、`defaultPaneId`、`rendererFactory`、`dataViews`；需要计算时再补 `runtime` 与 `plots`。
4. 在 `engine/renderers/` 实现绘制；通过注入的 `instanceId` 读取帧级投影，不持有计算缓存。
5. 覆盖注册、计算提交、结果投影和渲染投影测试。

系统绘制（主行情、最新价线、价格标签、极值标记）由图表视图声明并直接注册为 Layer，不属于指标定义。

## 测试

核心测试位于本目录及计算层：

- `pipeline/__tests__/indicatorPipeline.test.ts`：目录注册、懒加载和提交契约。
- `controllers/__tests__/indicatorOnDemand.test.ts`：恢复布局、目录同步与渲染结果读取。
- `engine/calculation/__tests__/calculationHub.test.ts` / `calculationKey.test.ts`：去重、排队、修订校验与身份编码。
- `__tests__/stateComposer.test.ts`：实例结果到 Plot 状态的投影。
- `projection/__tests__/indicatorTimelineProjection.test.ts`：计算时间轴到展示时间轴的投影。

指标数值测试位于 Script 包。运行 Core 指标相关测试：

```bash
pnpm --filter @363045841yyt/klinechart-core test
```
