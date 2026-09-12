# 对比原语与主品种解耦

## 背景

`comparison` 是与 `kline` 互斥的视图，展示若干条归一化涨跌幅折线。此前对比品种不是独立状态，而是 kline `dataState.symbols` 尾部的派生（index 0 = 主品种，tail = 对比品种）。`ComparisonCommands` 通过 `getSymbols()[0]` 隐式读取主品种，缺少主品种时抛 `COMPARISON_NO_PRIMARY`，导致 Agent（与 UI 等价）在 kline 视图未加载主品种时无法调用 `comparison_create` / `comparison_remove` / `comparisons_clear`。渲染侧还把 kline 主品种当作对比视图的固定首行折线与图例首行，使对比视图隐含“主品种”概念。

## 决策

### 1. 对比品种是独立 SSOT

`comparisonState` 拥有可写 `specs` signal，作为对比品种唯一业务状态；`colors` / `loading` / `referenceLength` 随其管理，`active = specs.length > 0`。`dataState.symbols` 收敛为仅 kline 主品种，二者不再通过 index 位置耦合。

### 2. 主品种由调用方显式传入，只用于补齐路由字段

`ComparisonCommands.create` / `add` 接收显式 `primary`（路由字段子集），只用于补齐缺省字段，绝不覆盖 `resolveInstrument` 解析出的真实 `exchange` / `id` / `params`。无 `primary` 时不阻断写入，因此移除了 `COMPARISON_NO_PRIMARY` 前置错误。

- UI：`addComparisonSymbol(spec, primary)` 与 `create` 保持该语义。
- Agent：`comparison_create` 工具 schema 带可选 `primary` 字段。

`primary` 不是“对比视图的主品种”，它只影响新增条目自身缺省字段的取值。

### 3. 对比集合是唯一展示集合

对比视图不区分主品种：渲染、y 轴范围、图例一律以 `comparisonState.specs` 为唯一集合。

- `Chart.setSymbols` 只写 kline 主品种，不再把 `specs[1..]` 当作对比集合。
- `Chart.setComparisonSpecs` 是 UI/Agent 整体写回对比集合的入口；集合非空进入 `comparison`，清空回到 `kline`。
- kline 主品种要出现在对比视图，必须由调用方经 `add` 显式作为普通序列加入集合（UI 在首次添加对比商品时推入当前主品种，并在切换主品种时替换该条目）。

### 4. 参考序列是纯技术细节

`specs[0]` 仅充当横轴时间索引与百分比基准的参考序列（`getComparisonReferenceData`），不具视觉/图例特权：

- `comparisonLine` 对集合每个已加载品种各画一条折线，没有独立主折线；`buildMainLinePoints` 与 `RenderContext.primarySymbol/primarySymbolName` 一并删除。
- `getComparisonViewLineRange` 只遍历对比集合的等价价极值。
- 图例 `collectComparisonRows` 只列出对比集合成员。
- `dataLength$` 在对比集合非空时改用 `comparison.referenceLength` 驱动视口。

## 影响

- 对比品种只有一份业务状态：`comparisonState.specs`。
- 对比原语不读取 kline 状态，UI 与 Agent 输入语义一致。
- 无主品种时 `comparison_create` 成功返回 `{ status: "added" }` 并进入对比视图，折线可见。
- `dataState.symbols` 不再拼装对比品种，对比数据由 `ComparisonManager` 订阅 `specs` 驱动。
- 对比视图与 kline 主品种完全解耦，不存在隐式或显式的主品种特权序列。
