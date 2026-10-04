# 绘图锚点

## 持久化与投影

已确认绘图的锚点持久化 `id`、`time`、`futureOffset` 和 `price`。常规锚点的 `time` 是图元绑定数据序列的时间戳；`price` 是 Pane 价格坐标。右侧留白中的锚点以创建时最后一根 K 线的 `time` 加正整数 `futureOffset` 表示。`index` 不得写入 `DrawingAnchor`、导入导出快照、`drawingState` 或轴标签。

### 帧内投影

每帧由活动 `DataBuffer` 的 `getLogicalIndexAtTimestamp()` 将基准时间解析为当前逻辑索引。常规锚点直接使用该索引；未来槽位锚点再加上 `futureOffset`。该索引仅存在于 `ResolvedDrawingAnchor`，用于从本帧的 `kLineCenters` 取得 X 坐标。

历史数据 prepend 后，基准时间会自然解析到新的逻辑索引。新数据追加时，未来槽位锚点会保留在创建时指定的时间轴槽位，并在对应 K 线出现后自然对齐该 K 线。时间戳不存在或重复时解析失败，图元不复用旧位置。已解析但位于可见区间外的锚点按当前帧几何投影到屏幕外，使 Canvas 裁剪线段；端点图元与轴装饰仅为可见锚点注册，绝不以视口边缘作为替代位置。

`kLineCenters` 是当前帧唯一的 X 坐标来源。K 线、单日分时与五日分时分别可使用等距、交易时段槽位和跨日槽位布局，但绘图交互不重新推导任何布局公式。`logicalIndexToScreenX()` 是渲染、命中与拖拽共用的逻辑索引到 X 投影；可见范围左、右侧分别按首、末中心点的槽位步长外推。指针 X 到逻辑索引、逻辑索引到 X 均经 `InteractionController` 已封存的中心点映射，保证午间休市和缺失分钟与画面一致。

### Pane 与工作区

图元通过 `paneId` 绑定价格坐标系；指针命中时先解析图表 Y 对应的 Pane，再以该 Pane 的局部 Y 生成或拖拽锚点。多锚点绘制会锁定首锚点 Pane，避免一次图元跨 Pane 生成不一致的价格坐标。

图元还持久化 `workspaceId`（`kline` 或 `timeshare`）。新建图元由当前数据视图写入工作区，渲染投影、会话预览、命中和拖拽均按活动工作区过滤。缺失该字段的旧快照按 `kline` 解释。

### 轴装饰

X 轴标签注册 `timestamp` 和当前帧派生的世界 X 坐标；Y 轴标签注册 `price` 和当前帧派生的 Y 坐标。轴标签不保存或消费 `dataIndex`。

## 组合图元锚点物化

组合图元（`parallel-channel`、`flat-line`、`disjoint-channel`）在创建时把派生点一次性物化为持久化锚点，之后只持久化坐标；渲染、命中、拖拽一律只读 `anchors`。拖拽跟随规则由命中目标与拖拽策略声明，不进入持久化模型。

### 物化

- 锚点数量：`getDrawingInputAnchorCount(kind)` 是用户输入数（1 / 2 / 3），`getDrawingAnchorCount(kind)` 是补齐后的持久化数（组合图元为 4）。
- `materializeDrawingAnchors(kind, anchors, createAnchorId)` 把输入补齐。第三个输入锚点只提供价格，时间被忽略：派生点复制首两点的时间坐标，因此不依赖时间轴能力，也没有派生索引越界的失败路径。
  - `parallel-channel`：两条线跨越同样的首两点时间，斜率相同。第 3 点取次点时间 + 第三个输入价格（光标落在次点时间槽上跟手）；第 2 点取首点时间，价格 = `third.price − (second.price − first.price)`。
  - `disjoint-channel`：两条线跨越同样的首两点时间，斜率互为相反数。第 2 点取次点时间 + 第三个输入价格；第 3 点取首点时间，价格 = `third.price + (second.price − first.price)`。
  - `flat-line`：两个水平端点分别落在首两点的时间上，价格同取第三个输入价格。
- 同 X 配对：`parallel-channel` / `flat-line` 为 `0↔2`、`1↔3`；`disjoint-channel` 为 `0↔3`、`1↔2`——它的第 2 点是第二条线的右端、第 3 点是左端，由「第二条线端点 = 首两点时间 + 负斜率」唯一确定，不是 `flat-line` 的左右同价平移。
- 导入的旧 3 锚点快照在 `replaceDrawings` 时走同一函数补齐。

### 帧内消费

绘图定义直接读 4 个持久化锚点，线段按 `[0, 1]` 与 `[2, 3]` 成对构成，不再按 kind 推导。只有 `regression-channel` 保留 `computedAnchors`：端点是数据拟合结果，无固定坐标可持久化，命中时映射回两个范围锚点。

`parallel-channel` 额外在同 X 端点的中点连线上画一条虚线中线（`showEndpoints: false`），观感对齐 `regression-channel` 的中间回归线；中线纯装饰，不参与锚点、命中与拖拽。

### 命中

命中目标只有 `{ type: 'anchor', index }`（锚点）与 `{ type: 'all' }`（图元主体）两种。`HitTester` 的锚点命中天然覆盖全部持久化锚点，第 4 点因此可拖；线段与填充都属于「图元主体」，不存在「拖某条边只动这条线」的中间形态。

填充命中只覆盖三个组合图元：填充多边形顶点顺序由 `fillRegions.ts` 的唯一一张表声明，绘制（`createXxxDefinition` 的 `area`）与命中（点在多边形内判定）共用同一份顺序，不会各自漂移。不相交通道第二条线方向相反，环绕顺序与另两者不同，单独登记。命中优先级为锚点 > 中点手柄 > 线段 > 填充；矩形与回归通道的填充不由四个持久化锚点直接构成，仍按线段命中。

### 拖拽策略

- `AnchorDragFollowers` / `resolveAnchorFollowers(kind, index)` 只回答「拖锚点 `index` 时哪些锚点一起动」。每项声明 `follow`：`time` / `price` 各取 `1` 同向、`-1` 反向、`0` 不跟随（缺省 1）；被拖锚点自身始终接受完整位移，未登记的图元只动被拖锚点。
- `DragHandler` 不认识 `kind`：锚点目标按 `resolveAnchorFollowers` 求移动组并按 `follow` 加权，整体目标对全部锚点施加同一屏幕位移；位移到时间 / 价格的换算仍由 `DragHandler` 统一完成。
- 已登记策略：
  - `parallel-channel`：端点按角色跨线成对（`0/2` 左端、`1/3` 右端）。拖任一端点时，另一条线上的同角色端点按同一位移跟随，剩下两点固定，两条线向量始终相同。
  - `flat-line`：`0/1` 斜线、`2/3` 水平线。同侧共享 X、水平线两端共享价格。拖斜线端点时水平线同侧端点只跟时间；拖水平线端点时斜线同侧端点只跟时间（`follow: { time: 1, price: 0 }`）、水平线另一端只跟价格（`follow: { time: 0, price: 1 }`）。
  - `disjoint-channel`：同 X 伙伴时间同向、价格反向（`follow: { time: 1, price: -1 }`），剩下两点固定；创建期不变量（`x(0) = x(3)`、`x(1) = x(2)`、`p(2) − p(3) = −(p(1) − p(0))`）在点拖与整体拖拽后都成立。
  - `regression-channel`：不做拖拽策略，命中映射回范围锚点后走缺省行为。

## 交易日解析错误码

`findAnchorAtTradingDate` 过去返回 `{ timestamp } | null`，`null` 同时代表三种互斥原因，Agent 收到后无法判断该改什么。本次把解析结果改成可判别联合，并按原因抛不同错误码。

| 原因 | 语义 | 可自纠的修正 |
| --- | --- | --- |
| 日期早于已加载最早 / 晚于最晚 | 范围外 | 改到 `[earliest, latest]` 内 |
| 日期在范围内但没有 bar | 非交易日 / 停牌 | 改成一个有 bar 的日期 |
| 数据源未提供每根 bar 的 `date` | 能力缺失 | 与日期无关，重试无效 |

契约：

```ts
export type AnchorTradingDateResolution =
  | { readonly kind: 'resolved'; readonly timestamp: number }
  | { readonly kind: 'out-of-range'; readonly earliest: string; readonly latest: string }
  | { readonly kind: 'not-trading' }
  | { readonly kind: 'date-unavailable' }
```

- `DrawingDocumentDependencies.findAnchorAtTradingDate` 返回该联合，不再返回 `null`。
- 原因判别在适配器完成（它持有 `chart.getData()`），错误码映射留在 `DrawingDocument`（领域语义的唯一归属）。
- `earliest` / `latest` 用 `string`：`KLineData.date` 从协议层起就是可选 `string`，不做不安全断言。

错误码（append-only）：

| 错误码 | 触发条件 | details |
| --- | --- | --- |
| `DRAWING_ANCHOR_DATE_OUT_OF_RANGE` | 日期在已加载范围之外 | `tradingDate, earliest, latest` |
| `DRAWING_ANCHOR_DATE_NOT_TRADING` | 日期在范围内但当天无 bar | `tradingDate` |
| `DRAWING_ANCHOR_DATE_UNAVAILABLE` | 数据无 per-bar `date` | `tradingDate` |

`DRAWING_ANCHOR_NOT_FOUND` 保留给时间戳锚点路径（`getLogicalIndexAtTimestamp` 未命中已加载 bar），语义收窄为「时间戳不可达」。

Agent 层 `drawingCreateFailure` 按新错误码返回各自的 `code` / `expected` / `recovery`，其中范围外与范围值直接带出 `earliest`、`latest`——修正所需信息随失败一起返回，不再要求模型去猜已加载范围。

边界：不注入全量交易日（范围边界只有两个值，token 恒定）；不把「日期在范围内但无 bar」的判定改为吸附（吸附会改变用户意图，属独立产品决策）；日内周期下「日期命中多根 bar」目前静默取首根，属行为问题另行决策。
