# Bar Aggregation 数据身份

## 背景

MT5 的服务器时间戳是伪 UTC，任何出网关的 K 线都必须先转换为真 UTC。高周期的锚时区重采样是独立于 UTC 校正的第二步：它会改变 4h、日、周、月 K 线的开盘边界。

单品种 K 线使用原生周期边界；对比视图使用统一边界。两者不是同一时间序列，不能共用缓存、Buffer、实时流或分页游标。

## 领域模型

`BarAggregation` 是 K 线请求与响应的必填字段：

- `original`：保留上游原生周期边界；仍完成伪 UTC 到真 UTC 的偏移校正。
- `aligned`：先完成 UTC 校正，再按数据源定义的统一边界重采样。

禁止将 `original` 解释为未校正 UTC。UTC 校正是网关不变量，不是可选展示策略。

## 派生规则

聚合方式不保存为另一个可变 UI 开关，而由 Comparison State 单一派生：

| 图表状态 | BarAggregation |
| --- | --- |
| 普通 K 线 | `original` |
| 对比视图 | `aligned` |

这样对比状态、数据请求和渲染数据之间没有手工同步路径。

## 数据身份与切换

`barAggregation` 是 K 线序列身份的一部分，必须同时进入：

1. Provider 请求与协议载荷；
2. `MarketDataCache` key；
3. `SeriesRepository` 的 BarsSelection 与叶子键；
4. MT5 SSE 的订阅 key、轮询任务和 Last-Event-ID 环形缓冲。

切换对比状态时，DataManager 销毁当前模式的主 Buffer，并创建、加载新模式的 Buffer。旧请求即使晚到，也因 Repository 身份不再匹配而不能写回当前视图。

## 失败语义

服务端收到 `aligned` 请求但其运行配置不允许对齐时，必须返回明确的能力拒绝。不得返回 `original` 数据并伪装为 `aligned`，否则会导致缓存和指标把不同桶边界当成同一序列。
