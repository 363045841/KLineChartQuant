# 最新价倒计时

## 帧时间快照

每个实际执行的帧在 derive 开始时从可注入的 Clock 读取一次 Unix 毫秒时间。同步 draw 和 rAF flush 共用该入口；generation 0 占位不读取时间。倒计时剩余时间、显示文本和 timer 延迟都使用本帧的 now，Layer 只读取 RenderContext 中已派生的 countdown。

ChartRenderer 继续作为倒计时 timer 的唯一所有者，在帧事务的副作用阶段管理 timer，不在 paint 内安排刷新。timer 只请求 Overlay 帧，实际绘制仍经过 FrameTransaction。保留现有每秒 Overlay 刷新，不新增通用时间驱动注册机制，也不改变交互帧的强制刷新规则。

Overlay 仅复用几何缓存，时间和倒计时每帧重新派生；版本键使用倒计时文本，绘制后的版本记录使用同一帧文本。收线、无数据、不支持的视图或周期、销毁时停止 timer。后台延迟后直接显示当前值，不补播过期秒数。

## 开关

main 分组的布尔设置 `showLastPriceCountdown` 默认 `true`。关闭时 derive 不输出倒计时，也不安排 timer，右轴价签自然恢复单行。设置 UI 和持久化沿用 `DEFAULT_SETTINGS` 的通用链路，Vue 无需改动。

## 市场时段计算

倒计时直接使用当前主品种 `market` 在 `MarketSessionRegistry` 中注册的配置，显示与秒级刷新共用该配置和计算函数。没有注册配置时隐藏倒计时，不推测市场时段。

`lastPriceCountdown.ts` 完整替换固定周期相加的实现：

- 分钟周期沿配置的交易时段推进，跳过午休等间隔；当天不足完整周期时，在最后一个时段收盘结束。
- 日 K 使用时间戳在市场时区对应日期的最后收盘时间。
- 分钟 K 延续现有约定，时间戳代表开线时间。

显示值为当前时刻距结束点的实际时间，包含尚未经过的休市间隔。例如 A 股 11:00 开始的 60 分钟周期，在 13:30 结束，11:00 显示 02:30:00。已收线或时间戳不在交易时段内的分钟 K 不显示倒计时。

计算使用市场 IANA 时区，独立于用户显示时区，墙钟与时区换算复用 `sessionTimeLabels` 已有的 `getMinuteOfDayInTimeZone` / `minuteOfDayToTimestamp`，不另建一套 Intl 逻辑。周期常量复用 `chartPeriod` 的 `isDailyPeriod`，日内周期分钟表以 `KLinePeriod` 约束键名。`tradingDays` 和节假日不参与计算；周 K、月 K 等需要跨日规则的周期暂不显示倒计时。`slotMinutes` 是分时几何参数，不参与 K 线周期计算。

## 验证

覆盖内置五个市场、冬夏时区偏移、跨午休、末根截断、毫秒边界、自定义时段与无配置场景，以及最新价标签注册链路。倒计时标签的收集与绘制见[轴标签单帧收集模块化](../rendering/axis-labels.md)。
