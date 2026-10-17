# Script Request 与共享行情

## 调用与编译

`request.security(symbol, timeframe, expression, options?)` 在 onBar 顶层声明。
expression 是无参数同步函数，在独立目标行情运行态逐根执行，返回标量、Series 或元组。
Series 在目标上下文物化为数值，元组只读。回调可以使用 input，不能捕获 onBar 的其他局部计算值。
第一版不支持嵌套、动态请求或低于主图的周期。缺少行情快照直接报错，不借用主图数据。

syminfo.tickerid 表示图表品种。请求品种与图表品种相同时继承图表已解析的来源；
请求其他品种时必须显式给出 options.source，否则拒绝执行，不做隐式选源或跨来源回退。
options.source 使用共享的 DataSource 枚举。calcBarsCount 是主图历史起点之前的目标预热根数。

输入转换与 Series 转换复用既有编译流程，随后提取 Request 声明和独立表达式。
局部捕获检查使用 @typescript/vfs 的纯内存 CompilerHost，不依赖浏览器 Worker 缺失的 ts.sys。
Worker 的 requests 消息读取计划，宿主加载数据后通过既有 run 消息执行；闭包不跨线程传输。
Native 与 QuickJS 共用计划和对齐函数，每个目标表达式拥有独立运行态与 ta 缓存。
QuickJS 注入保留 NaN/Infinity，不用 JSON 的 null 替换缺值。

## 行情与所有权

事实仍由 MarketDataCache 与 SeriesRepository 保存。历史加载坚持游标之前 N 根，
根据实际返回时间戳继续分页，直到覆盖主图已加载历史并补足预热，或 Provider 声明耗尽。
不估算交易日历起点，不增加第二套网络查询实现。

主图、比较和 Request 的实时连接统一由 MarketRuntime 协调。
比较与 Request 共用一张行情需求表，按完整序列身份复用 Buffer 和连接。
比较保留展示与加载状态；Request 保留目标周期计算和对齐。
移除比较时保留脚本仍使用的 Buffer；脚本释放时保留比较或主图仍使用的 Buffer。
实时帧更新现有缓存条目及 Repository 叶子，依赖版本参与现有指标缓存身份。
更新复用既有指标调度器，过期异步结果由请求版本屏障丢弃。
历史合并没有新增时间戳时不发布存储变更，避免 Request 读取共享主图序列反复触发自身重算。

## 时间语义与验证

第一版不新增收盘确认。末根读取当前目标桶最新快照，目标数据变化后重算。
历史对齐使用相邻实际时间戳判断目标结果在主图 bar 右边界是否可用，
不将整个高周期最终值铺到桶内全部小周期 bar。当前不提供防重绘信号保证。
gaps=off 延续最近结果；gaps=on 只在新目标结果出现时输出，其余点保持形状并填 NaN。

测试覆盖双后端目标周期均线、元组蜡烛、来源枚举、局部捕获拒绝，
以及 ts.sys 缺失的浏览器式编译。Core 使用真实仓库与既有 Provider 夹具验证两种释放顺序。
