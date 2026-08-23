# Timestamp Session Slot 性能决策

## 背景

`resolveTimestampSessionSlot` 在分时和五日分时帧几何计算中按数据点调用。旧实现每次调用都创建
`Intl.DateTimeFormat`，同时构造 `Date` 并解析年月日时分。五日分时一帧最多处理上千个点，Intl
初始化因此成为主线程热点。

## 决策

- 按 IANA 时区缓存只包含 `hour`、`minute` 的 `Intl.DateTimeFormat`，同一市场跨数据点和帧复用。
- 缓存限制为 16 个时区，达到上限时整体清空，避免动态数据源持续引入时区造成无界增长。
- 槽位映射只解析墙钟分钟，不再获取无关的年月日字段。
- 使用 ECMAScript `Date` 的 TimeClip 有效范围校验时间戳，并直接将数字时间戳传给 Intl，避免额外
  `Date` 对象分配。
- 保留 Intl 时区转换，不使用固定 UTC offset，确保美国等市场的 DST 语义不变。

## 影响

首次处理某个时区时仍需初始化一次 Intl formatter；后续每个数据点只执行格式化和 session 区间匹配。
函数输入输出及收盘边界规则保持不变。
