# SVP/PVP脚本指标与公共时间、明细数据链路

## 指标归属

SVP与PVP只存在于`packages/script/scripts/`。分组、分箱、上涨/下跌成交量、POC、价值区和绘图调用在` scripts/libraries/volume-profile.ts`共享；Core只保留公共绘图、市场时段配置、数据请求和主题解析。Core目录不再注册这两个指标，不允许其新增Layer或在paint内聚合行情。旧版声称脚本只能输出逐bar序列的设计文档随实现一起删除。

## 数据流与SSOT

Chart持有的MarketSessionRegistry传到MarketRuntime，与图表几何和脚本共享同一份配置，支持宿主覆盖。中立时段结构由plot-contracts/time.ts定义，Core不维护第二份类型。内置JSON记录时区、常规时段、扩展时段、年度例外和来源；MT5的近似画像显式标注，不虚构经纪商日历。

脚本Request编译器把请求声明与表达式分离；security和security_lower_tf共用这条链路。ScriptExecutor向原有MarketRuntime请求快照，复用Repository、游标分页和实时订阅。低周期模式加载最近的实际明细，默认上限十万根，calcBarsCount可降低预算。按主图时间区间分桶，每bar返回时间升序数组；元组表达式返回多列数组，编译器保留列数以保证完全没有数据时仍返回空列。缺口不延续上一根的明细。实时明细修订沿现有requestRevision失效链路重算。

时间上下文随快照进入Worker；原生与QuickJS后端及Core请求边界调用同一个中立timeApi，QuickJS不依赖Intl。time既可按历史偏移读取，也可查询周期/自定义时段边界；time_close、timeframe.change/in_seconds/period、time_tradingday与session的常规盘/盘前/盘后标记由这一层提供。自定义时段支持多段、星期过滤和隔夜，IANA时区承担DST规则。

## 输出

横条与背景用box.new，POC/VAH/VAL用line.new；时间端点经公共bar_time插值投影。颜色使用`@token:volumeProfile.*`，由通用token路径解析在当前主题下取色，不把色值塞进脚本。字符串输入的value/label定义在plot-contracts，由所有参数面板消费。

保留原先的蓝黄分段、价值区配色、左右位置、背景框、参考线开关和延长至首次覆盖价格的行为。绘图对象预算按整张profile计算，超预算只保留最近完整期，并在脚本输出记录保留数量，不保留半张分布。没有低周期数据时输出明确诊断。SVP不声明minute/hour可见性白名单，统计周期独立于主图周期。

## 验证边界

测试直接执行随包源码，双后端共享用例覆盖元组完整性、缺失槽位、日线上多期绘图、重复运行和空数据；时间用例覆盖DST、午休、官方休市和提前收市。移除重复维护show开关名单的实现镜像用例。逐bar纯序列的通用不变量用例不再承担有外部Request的指标验证，后者由实际明细测试负责。

当前实现提供Pine风格的常用时间面，不宣称完整复刻所有Pine重载。图表与请求品种不同且交易时段不同时，还需目标品种上下文才能对齐跨品种时间函数；这不影响SVP/PVP使用当前品种。年度日历覆盖范围外和MT5经纪商画像不能被解释成完整权威交易日历。截图像素级验收仍需要真实行情和浏览器验证。
