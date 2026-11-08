# 内置市场交易时段数据

`packages/core/src/foundation/config/marketSession/builtinMarketSessions.json` 是内置配置的唯一来源，覆盖当前注册的 CN、HK、KR、US、MT5、BINANCE_SPOT。原有具名常量与注册表读取同一份数据。时钟以 IANA 时区下的当地分钟表示；默认 `sessions` 只包含常规盘，保留分时图既有网格语义。

扩展时段与常规盘分开。US 按具体交易所列出盘前盘后，不把 NYSE 订单接收时段当成可成交盘前；港股集合竞价随机结束，不能硬写成连续交易。KR 的盘前盘后交易方式与连续竞价不同，记录在 notes。板块、产品、交易场所不同的时段须用宿主 `marketSessions` 配置覆盖，不以地区代码推断所有证券。

`calendars` 记录明确年份的官方休市与特殊常规盘时段，日期为交易所本地日期。没有覆盖的年份表示未知。临时停牌、恶劣天气与维护不由固定年度表预测。MT5 仅保留原来的近似展示画像，标记 approximate；实际时段要按经纪商和品种读取 SymbolInfoSessionTrade，不能把所有 MT5 品种解释成外汇24/5。

现有分时几何仍读取常规 sessions。脚本 time/time_close/session/timeframe.change 与低周期分桶统一消费 plot-contracts 的时间规则；Chart持有的同一份注册表传到MarketRuntime，再随快照提供给脚本。扩展时段必须明确选定交易场所后配置到premarket/postmarket，年度配置不取代行情源的权威历史交易日历。
