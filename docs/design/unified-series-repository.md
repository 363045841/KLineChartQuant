# 统一行情序列仓库

## 背景

当前行情数据由 `ChartDataManager` 中的 K 线 Map、分时 Map、Comparison runtime 和
`customData` 写入路径共同维护。虽然最终数据都进入 Buffer，但不同类型和用途仍通过不同
入口管理，造成以下问题：

- K 线、分时和对比序列的创建、查询、销毁规则分散。
- 主图与对比图的使用角色进入 Buffer key，数据身份与视图身份混在一起。
- `customData` 同时承担注册数据和切换当前品种，形成第二套选品入口。
- active data 使用 `unknown[]`，K 线与分时的类型边界只能由调用方断言。
- source 回退后的实际来源没有成为序列身份的一部分，前端无法稳定表达来源选择。

## 决策

新增图表实例级 `SeriesRepository`，作为所有行情 Buffer 的唯一所有者。

Repository 只管理“图表实例中有哪些行情序列”，不接管当前选择、Provider 路由、指标、
视口、交互或渲染职责。

```text
SeriesRepository：数据仓库
StateKernel：当前选择
ChartDataManager：协调仓库、Provider 与 Kernel
ChartRenderer：读取 active snapshot 并绘制
```

## 数据结构

Repository 使用不可变 Map 快照维护低频拓扑，叶子 Buffer 使用各自的 signal 发布高频数据
变化。

```ts
/** 图表实例内全部行情序列的只读拓扑。 */
type SeriesRepositorySnapshot = ReadonlyMap<InstrumentKey, InstrumentSeriesNode>

/** 同一市场品种的数据集合；不包含主图或对比图等视图角色。 */
interface InstrumentSeriesNode {
  /** 同一品种按实际数据来源隔离，禁止跨来源混合行情。 */
  readonly sources: ReadonlyMap<SourceId, SourceSeriesNode>
}

/** 单个数据来源提供的强类型序列集合。 */
interface SourceSeriesNode {
  /** K 线按周期和复权方式隔离。 */
  readonly bars: ReadonlyMap<BarSeriesKey, KLineBuffer>

  /** 分时数据按交易日隔离。 */
  readonly timeShare: ReadonlyMap<TradingDateKey, TimeShareBuffer>
}

/** 标识一个市场品种，至少包含 market、exchange 和 symbol。 */
type InstrumentKey = string

/** 标识一个实际来源，例如 gotdx、baostock 或图表级 custom source。 */
type SourceId = string

/** 标识 K 线周期和复权方式，例如 daily:qfq。 */
type BarSeriesKey = string

/** 标识分时交易日；latest 表示由 Provider 解析当前交易日。 */
type TradingDateKey = string
```

`InstrumentKey` 不能只使用 `symbol`。不同市场可能存在相同代码，统一 key 必须包含规范化
市场身份。Provider 私有参数属于 source 节点，不进入跨来源的品种身份。

## 收敛规则

### 数据只存一处

主图、对比图和其他数据视图不分别保存行情。它们只持有 `SeriesSelection`，并引用
Repository 中的同一叶子 Buffer。

“主图”和“对比图”是使用角色，不是序列身份，因此不得进入 Repository key。

### 来源相互隔离

同一品种的 BaoStock、TDX、TradingView 和 custom 数据分别进入独立 source 节点。不同来源
的数据不能合并到同一个数组，也不能在同一个 Buffer 的分页过程中切换来源。

### K 线与分时保持强类型

统一的是所有权和查找入口，不是叶子数据模型：

- `KLineBuffer` 保存 `KLineData`，负责周期、复权、分页和历史增量加载。
- `TimeShareBuffer` 保存 `TimeShareData`，负责交易日、昨收和分时范围快照。

Repository 对外返回判别联合，禁止使用 `unknown[]` 抹平差异。

## 当前选择

当前选择属于 `StateKernel.data`，不属于 Repository。

```ts
/** 当前图表消费的唯一序列选择。 */
type SeriesSelection =
  | {
      readonly kind: 'bars'
      readonly instrumentKey: InstrumentKey
      readonly sourceId: SourceId
      readonly period: KLinePeriod
      readonly adjustment: KLineAdjustment
    }
  | {
      readonly kind: 'timeShare'
      readonly instrumentKey: InstrumentKey
      readonly sourceId: SourceId
      readonly tradingDate: TradingDateKey
    }
```

`symbols` 仍是用户选品的业务输入。`ChartDataManager` 将主品种 `SymbolSpec` 解析为
`SeriesSelection`，通过一次 Kernel Action 原子切换 active selection 和 active snapshot。

对比品种列表也只保存选择，不拥有 Buffer。Comparison runtime 订阅对应叶子 Buffer，并将
结果投影给比较视图。

## 信号模型

Repository 拓扑与 Buffer 数据使用两级信号：

```text
Repository Map signal
  只在注册或删除 Buffer 时更新

Buffer data signal
  在 Provider、分页或内联数据写入时更新
```

触发链如下：

```text
Provider/custom source 写入叶子 Buffer
  -> Buffer data signal 更新
  -> ChartDataManager 发布强类型 active snapshot
  -> 指标计算
  -> scheduleDraw
  -> Renderer 读取同一 active snapshot
```

Repository Map 必须通过 Actions 创建新的 Map 快照，禁止原地 `set/delete` 后继续发布同一
引用。Map 的 value 是稳定 Buffer 引用，因此拓扑更新不复制行情数组。

非 active Buffer 更新时，不触发主图指标计算。对比图只订阅当前 comparison selections
引用的 Buffer。

## 数据源选择

前端支持两种来源策略：

- 显式 source：只读取用户选择的 Provider，不自动切换到其他来源。
- `auto`：允许 `SourceRouter` 选择来源，但首次成功后记录实际 `sourceId`，同一 Buffer 的后续
  分页继续使用该来源，禁止跨 Provider 混页。

Provider 选择仍由 `SourceRouter` 负责。Repository 只按最终 source 身份保存 Buffer，不实现
能力探测、优先级或网络回退。

## 自定义数据

自定义数据注册为图表实例级 source，并进入与 Provider 相同的 Repository：

```text
注册 custom source 数据
  -> 创建 custom SourceSeriesNode
  -> 写入对应 KLineBuffer/TimeShareBuffer
  -> symbols 选择用户定义的品种和 source
  -> active selection 切换
```

`customData` 可保留为兼容入口，但内部只负责注册 custom source。长期公共模型应将“注册
数据”与“选择 symbol”拆开，不能继续维护独立 custom mode、`preCustomSpec` 或专用恢复逻辑。

custom source 必须绑定 Chart 实例，不能注册到全局 `marketDataProviderRegistry`，避免不同
图表之间的数据冲突和生命周期泄漏。

## Repository 职责

`SeriesRepository` 负责：

- 按统一身份注册和查询 K 线、分时 Buffer。
- 保证相同序列 identity 只对应一个叶子 Buffer。
- 以不可变拓扑快照发布注册和删除变化。
- 统一删除、按品种删除和销毁全部 Buffer。
- 在删除时只销毁一次 Buffer，并拒绝复用已销毁实例。

`SeriesRepository` 不负责：

- 保存主图、对比图等视图角色。
- 保存当前 active selection。
- 选择或回退 Provider。
- 运行指标、修改视口或触发绘制。
- 保存组件 props 或 UI 状态。

## 迁移步骤

1. 在 `packages/core/src/data/buffer/` 新增 Repository 类型、身份函数和单元测试。
2. 将 `ChartDataManager` 的 `_klineBuffers`、`_tsBuffers` 和 Buffer 创建/销毁迁入 Repository。
3. 将 `ComparisonManager` 改为按 selection 引用 Repository，不再通过 Map-shaped hooks 管理
   Buffer。
4. 将 active snapshot 改为 K 线/分时判别联合，删除渲染链中的 `unknown[]`。
5. 将 custom data 注册为图表级 source，删除 `preCustomSpec` 和 custom mode 恢复路径。
6. 补齐 source 隔离、周期/复权隔离、分时交易日、comparison 引用、custom source 切换、
   销毁和 active signal 触发测试。
7. 删除旧 Map、旧 key 前缀分支和过渡适配，确保实现中只剩一套 Buffer 所有权。

## 验收条件

- 每个 Chart 只存在一个 `SeriesRepository`。
- K 线、分时、主图、对比图和 custom source 不再拥有平行 Buffer Map。
- 相同 symbol 的不同 market、source、period 和 adjustment 不发生碰撞。
- 显式 source 不回退；`auto` 不在同一 Buffer 中混合实际来源。
- active selection 切换时，数据、loading、error、分时范围和昨收以完整快照发布。
- 非 active Buffer 更新不触发主图重绘。
- Core、Vue、React、Angular 测试和包构建通过。
