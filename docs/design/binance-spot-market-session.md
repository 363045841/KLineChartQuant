# Binance 现货市场时段

Binance 连接器的品种描述返回 `sessionId: BINANCE_SPOT`，市场时段注册表为该 ID 提供对应的配置。

在市场时段注册表内置 Binance 现货配置，使用 UTC、每日 `[0, 1440)` 分钟及一周七个交易日。配置独立于 MT5 外汇时段，避免将外汇的周末休市语义用于现货。

该配置也用于日线倒计时，Binance 日线按 UTC 午夜收线。其他周期按时间戳与周期长度计算；规则见[最新价倒计时](session/last-price-countdown.md)。
