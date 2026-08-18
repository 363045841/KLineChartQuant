# Data Buffer

本目录提供图表数据的缓冲层中间件，位于数据源 Provider 与图表引擎之间。

## 模块职责

Buffer 负责管理当前品种的一份可供图表消费的数据快照，主要职责包括：

- 保存已加载的 K 线或分时数据。
- 维护当前 `SymbolSpec`、已加载时间窗口和数据变更信号。
- 合并初始请求、历史分页和增量数据。
- 处理请求版本、重复请求、过期响应和重试状态。
- 支持内联数据写入，并统一向上层发布 `data`、`loading` 和 `lastError` 状态。
- 为 K 线历史加载维护时间索引，供可见范围和增量加载判断使用。

Buffer 不负责选择 Provider、不负责维护当前图表业务状态，也不直接绘制 Canvas。

## 数据流

```text
SymbolSpec
  -> ChartDataManager 解析 SeriesSelection
  -> SeriesRepository 查询或注册 Buffer
  -> ChartDataManager 注入 Provider/custom source 的 fetcher
  -> Buffer 加载、合并或写入数据
  -> Buffer.data 发出变更
  -> ChartDataManager 发布 active buffer 快照
  -> 指标 Scheduler 计算
  -> ChartRenderer 读取当前数据并绘制
```

Provider 的选择和数据源回退由 `ChartDataManager` 与 `SourceRouter` 负责。Buffer 只通过注入的 fetcher 获取数据，因此网络 Provider 和图表级自定义数据都可以使用同一套 Buffer 输出契约。

## 主要实现

`SeriesRepository` 是图表实例内全部 Buffer 的唯一根容器；`DataBuffer` 和`TimeShareBuffer` 是根容器中的数据容器，分别保存 K 线和分时数据。

### `dataBufferTypes.ts`

定义 Buffer 的共享契约：

- `DataBufferLike`：K 线和分时 Buffer 的公共读取、状态和销毁接口。
- `KLineBuffer`：K 线加载、分页、内联写入和时间索引接口。
- `TimeShareBuffer`：分时查询日期、范围和昨收接口。
- `DataChange<T>`：保留 K 线或分时类型的数据快照及前置插入数量。
- `BarPageRequest` / `BarPageResult`：K 线分页请求和响应协议。

### `SeriesRepository`

图表实例内全部行情 Buffer 的唯一所有者。Repository 使用
`Instrument -> Source -> KLine/TimeShare` 三级拓扑，并通过只读 signal 发布不可变 Map 快照。

- 品种身份由 `market`、`exchange` 和 `symbol` 共同确定。
- K 线按实际来源、周期和复权方式隔离。
- 分时按实际来源和交易日隔离。
- 主图和对比图只引用同一叶子 Buffer，视图角色不进入序列身份。
- `auto` 首次请求成功后将叶子迁移到实际 Provider 节点，后续请求锁定该来源；若实际节点已存在，则复用已有叶子并释放重复请求 Buffer。
- 删除叶子、删除品种和销毁图表时，由 Repository 统一销毁 Buffer。

### `DataBuffer`

实现 `KLineBuffer`，用于日 K、周 K、月 K 和分钟 K 数据。

- `setSymbol(spec)`：切换品种并开始初始加载。
- `setInlineData(data)`：写入用户自备数据，跳过 Provider 请求。
- `ensureRange(start, end)`：确认 Buffer 里是否已经有用户当前想看的时间范围，如果没有请求可见范围之外的历史数据。
- `setRequestFetch(fetcher)`：由上层注入分页请求函数。
- `data`：发布包含数据和 `prependedCount` 的变更快照。
- `loadedTimeRange`：返回当前已加载数据覆盖的时间范围。

当 `SymbolSpec.incremental === false` ，即不支持**增量加载**时，Buffer 不会继续请求更早的历史数据，适用于静态内联数据。

```json
[
  {
    "timestamp": 1786924800000,
    "date": "2026-08-17",
    "open": 1418.2,
    "high": 1432.5,
    "low": 1412.8,
    "close": 1426.7,
    "volume": 258000
  }
]
```

### `TimeShareBuffer`

实现分时数据缓存。分时数据按交易日组织，并将点列、交易日范围和昨收作为一个内容快照写入，避免相关状态分开更新。

```json
{
  "instrumentId": "gotdx:stock:1:600519",
  "timezone": "Asia/Shanghai",
  "requestedDays": 1,
  "olderData": "unknown",
  "days": [
    {
      "tradingDate": "2026-08-18",
      "preClose": 1420.5,
      "data": [
        { "timestamp": 1787016600000, "price": 1428.2, "average": 1426.8, "volume": 1200 }
      ]
    }
  ]
}
```

## 上层协作边界

### `ChartDataManager`

负责协调当前选择、Repository、Provider 和 Kernel：

- 将 `SymbolSpec` 转换为强类型 `SeriesSelection`。
- 通过 Repository 查询、创建和激活 Buffer。
- 订阅 active Buffer 的数据和加载状态。
- 将选择、数据、加载状态和分时元数据原子投影到 StateKernel。
- 在 K 线数据变化后触发指标计算、滚动补偿和重绘。

### `SourceRouter` / Provider

负责根据 `SymbolSpec` 解析品种、选择数据源并返回分页结果。Provider 不直接操作 Buffer，由 `ChartDataManager` 通过 fetcher 适配到 Buffer。

### `ChartRenderer`

只读取当前 active data 快照和指标计算结果，负责可见范围、K 线几何和各 Pane 的绘制。Renderer 不区分数据来自网络 Provider 还是内联数据。

## 设计约束

- Buffer 是单个品种/周期的数据缓存，不是多 Provider 聚合器。
- Repository 只拥有可用序列，不保存 active、主图或对比图等视图状态。
- active Buffer 是当前图表数据的唯一来源；未激活 Buffer 的变化不能触发当前图表绘制。
- 数据写入和 Buffer 切换必须通过 `ChartDataManager`，避免 Renderer 或组件直接维护数据副本。
- custom 数据使用带 `chart-custom:` 保留前缀的图表实例级 source，与网络 Provider ID 隔离。
- Buffer 只发布数据和加载状态；指标、视口、交互和绘制状态由上层模块负责。
