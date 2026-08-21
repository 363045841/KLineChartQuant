# Indicators 指标模块

`packages/core/src/engine/indicators/` 负责技术指标的注册、实例管理、异步计算、结果提交和可见范围投影。
它位于行情数据与指标 renderer 之间：接收 StateKernel 的数据和配置快照，计算结果写入
`StateKernel.indicatorResult`；renderer 只在帧内读取已提交的 `renderStates`，不会直接依赖
Scheduler、Worker 或 PluginHost。

完整的指标结果状态与版本语义见
[`docs/design/indicator-result-kernel-state.md`](../../../../../docs/design/indicator-result-kernel-state.md)，
实例结果池与后续查询边界见
[`docs/design/indicator-instance-result-pool.md`](../../../../../docs/design/indicator-instance-result-pool.md)。

## 模块边界

```text
StateKernel.data + StateKernel.indicator
  -> IndicatorScheduler
  -> Worker 或 IndicatorRuntime（inline）
  -> StateKernel.indicatorResult.commitResults
  -> composeRenderStates / visibleStateComposers
  -> committed.renderStates
  -> IndicatorRenderStateReader（帧级快照）
  -> engine/renderers/Indicator
```

本目录负责：

- 注册指标元数据、运行时 calculator、renderer 和状态投影规则。
- 以 `instanceId` 和参数快照为单位计算指标实例结果。
- 选择 Worker 或 inline runtime，并处理过期请求、错误和降级。
- 将完整计算结果与可见范围派生状态原子提交到 `indicatorResult`。
- 管理主图/副图实例及其与 pane 布局的协作。

本目录不负责：

- 指标图形、坐标轴和图例的实际绘制；它们位于 `engine/renderers/Indicator/`。
- 调整 Canvas、WebGL 或 WebGPU 的帧边界；由 `ChartRenderer` 与 `rendering/` 负责。
- 将内部计算对象直接提供给 Controller 或 Agent；公开查询必须基于已提交结果构造受限 DTO。
- 维护指标的业务事实源副本；唯一事实源是 `StateKernel.indicatorResult`。

## 目录结构

```text
indicators/
├── chartIndicatorManager.ts     # 指标实例和副图 pane 的高层业务操作
├── scheduler.ts                 # 请求版本、Worker/inline 调度、原子提交和可见投影
├── indicatorRuntime.ts          # 主线程计算运行时
├── indicator.worker.ts          # Worker 入口，复用 runtime 与协议
├── workerProtocol.ts            # Worker/inline 共享请求和结果契约
├── indicatorMetadata.ts         # 指标定义契约与运行时描述符
├── indicatorRegistry.ts         # 运行时元数据注册表和别名解析
├── indicatorDefinitionRegistry.ts # 内置/扩展定义的全局声明注册表
├── registerBuiltins.ts          # 内置指标定义装配
├── stateComposer.ts             # 完整计算结果到 renderer 状态的投影
├── visibleStateComposers.ts     # 可见区极值、padding、latestValues 等派生投影
├── soa.ts                       # Worker 传输使用的行情 Structure of Arrays 编码
├── calculators/                 # 纯计算函数，不读取 Chart、DOM 或 PluginHost
├── state/                       # 各指标 renderer 所需的状态类型和 state key
└── __tests__/                   # 调度、注册、运行时、投影和 calculator 测试
```

## 身份模型

三个标识不能混用：

| 标识           | 含义                             | 主要用途                                       |
| -------------- | -------------------------------- | ---------------------------------------------- |
| `definitionId` | 指标定义类型，例如 `MACD`、`RSI` | 解析 metadata、calculator、默认参数和 renderer |
| `instanceId`   | 一次添加指标产生的稳定业务身份   | 更新、删除和查询某个具体实例的结果             |
| `paneId`       | 指标所在绘图区的布局身份         | 管理副图高度、定位 renderer 和右轴             |

同一 `definitionId` 可以有多个 `instanceId`，每个实例使用独立参数计算。副图由
`ChartIndicatorManager.addIndicator()` 分别创建 `instanceId` 和 `paneId`；主图指标绘制在 `main`
pane，当前高层 API 返回规范化的 `definitionId`。

## 计算与提交

`IndicatorScheduler` 从 Kernel 获取 data/config revision 和实例快照，每次计算按以下规则执行：

1. 调用 `indicatorResult.beginCalculation()` 记录带 `requestId` 的计算尝试。
2. 优先向 Worker 发送 `workerProtocol.ts` 定义的请求；不可用或失败时使用 `IndicatorRuntime` inline 计算。
3. 每个实例按自己的 `definitionId`、合并默认值后的参数和行情数据调用 calculator。
4. 计算完成后一次 `commitResults()` 写入时间轴、实例结果、legacy bundle 和 renderer 投影。
5. 仅当 requestId、dataRevision、configRevision 仍匹配当前 attempt 时提交；过期响应被丢弃。
6. 失败调用 `failCalculation()`，保留最近成功结果，但当前 availability 变为 `error` 或 `stale`。

`CommittedIndicatorResult` 的关键字段：

- `timestamps`：与 bar 对齐序列下标严格一致的行情时间轴。
- `results`：以 `instanceId` 为键的业务结果事实源。
- `bundle`：按指标定义组织的兼容结果，仅供 renderer 状态投影使用。
- `renderStates`：当前可见范围的派生渲染状态，不是业务查询来源。
- `resultVersion`：成功计算结果版本；可见范围变化不增加该版本。
- `projectionVersion`：可见范围投影版本；每次更新 `renderStates` 递增。

提交时 Scheduler 将结果对象所有权转移给状态模块，并递归冻结。提交后的 calculator、runtime 和
renderer 都只能读取该对象图，禁止原地修改序列或参数。

## Renderer 协作

`stateComposer.ts` 负责从完整结果构造基础 renderer 状态；`visibleStateComposers.ts` 负责基于
当前可见范围计算极值、padding 和 latestValues。两者结果由 Scheduler 写入
`committed.renderStates`。

帧开始时 `ChartIndicatorManager.createRenderStateReader()` 绑定当前已提交快照。指标 renderer 只能
通过 `IndicatorRenderStateReader` 读取该帧状态，禁止在绘制期间向 PluginHost StateStore 写入或读取
指标事实状态。这样同一帧全部 renderer 看到的是同一个 result/projection version。

`outputAlignment` 的语义：

- `bar`：输出序列与 K 线下标对齐，可从 `firstReadyIndex` 识别 warm-up 区间。
- `aggregate`：输出不按单根 K 线对齐，例如 Structure、Zones、Volume Profile；其
  `firstReadyIndex` 为 `null`。

## 新增或修改指标

1. 在 `calculators/` 编写纯计算函数；输入为行情与已解析参数，不能依赖 Chart、DOM 或全局渲染状态。
2. 在 `state/` 定义 renderer 状态、空状态和稳定 state key。
3. 在内置定义装配中声明 `IndicatorMetadata`：类别、默认 pane、renderer factory、runtime descriptor、
   `outputAlignment` 与 `visibleState.compose`。
4. 为需要可见范围缩放的指标补充或复用 `visibleStateComposers.ts` 中的 composer。
5. 在 `engine/renderers/Indicator/` 实现绘制；读取帧级 `IndicatorRenderStateReader`，不持有计算缓存。
6. 覆盖 calculator、registry、runtime/Worker 一致性、Scheduler 提交和 renderer 状态投影测试。

新增字段或调整序列语义时，同时更新指标结果池设计文档和 D 轮公开查询 DTO 契约，避免外部消费者依赖
`bundle` 或 `renderStates` 的内部形状。

## 测试

核心测试位于本目录 `__tests__/`：

- `scheduler.test.ts`：请求身份、Worker/inline、失败降级、结果提交和可见范围更新。
- `indicatorRuntime.instanceResults.test.ts`：多实例独立计算、参数隔离和输出对齐。
- `indicatorRegistry.test.ts` / `indicatorDefinitionRegistry.test.ts`：元数据、别名和定义注册。
- `stateComposer.test.ts`：完整结果与 renderer 状态投影。
- 其余按指标命名的测试：各 calculator 的数值和边界条件。

运行 Core 指标相关全量测试：

```bash
pnpm --filter @363045841yyt/klinechart-core test
```
