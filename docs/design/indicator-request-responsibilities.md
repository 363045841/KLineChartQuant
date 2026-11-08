<!-- 指标行情请求拆分的职责及生命周期约束。 -->
# 指标行情请求职责

`IndicatorBarsRepository` 协调请求校验、需求获取、范围补齐和快照返回。
`IndicatorBarsDemandRegistry` 保存共享需求及 owner 集合，负责最后一个使用者离开时取消任务。
`indicatorBarsLoader` 负责已知品种提前绑定实时 Buffer、历史游标分页及最终合并。
`indicatorBarsProjector` 负责市场时间上下文与脚本只读 Bar 的范围投影。

实时连接仍由 MarketRuntime 统一管理，历史和实时数据仍写入同一 Repository Buffer。
调用者取消等待不取消其他 owner 共享的请求；图表会话切换后旧结果不得写入。
历史查询期间收到的实时更新在历史合并后重新应用，避免历史快照覆盖最新事实。
请求身份不包含实时版本，范围扩展时继承原需求 owner，失败清理仅作用于原任务身份。
