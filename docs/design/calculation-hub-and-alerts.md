# 行情计算与脚本警报

图表与警报共用脚本定义、计算中枢和执行会话。会话按行情序列、定义、参数和计算上下文复用。图表实例的位置与样式由视图投影。

## 所有权

- `MarketRuntime` 持有行情宿主、实例级定义注册表、`MarketDataService`、`CalculationHub` 与市场时段；Worker 池由脚本执行服务持有。图表和警报只持有自己的 client 与 feed。
- 图表与警报是平级消费者：图表用 `onCommit` 取最新完整结果，警报用 `onResult` 逐次消费。任何一方销毁都不释放中枢。
- 定义注册表随运行时创建，不再有全局注册表。定义替换时注册表写入新的元数据对象，计算层据此换掉旧计算器并让中枢丢弃旧结果。
- 警报规则身份是 `(脚本, 品种, 参数)`；同一脚本可以在多个品种上各有一条规则，选择器按当前品种投影规则。
- 运行时由 `createMarketRuntime({ market, definitions, clock })` 创建；图表与警报分别通过 `createChartController({ runtime })` 与 `createAlertRuntime({ runtime, rules, fires, limits, onError })` 接入。警报的时间取自 `runtime.clock`，容量与错误出口由宿主显式给出。两者都从 `runtime.data` 取数，没有图表时警报仍按同一服务运行。

## 行情与计算

- `MarketDataService` 按序列向计算 Hub 发布修订，图表与警报只登记计算需求。`closedBarTime` 取自上游收盘帧的时间戳。
- 视图读取最新完整结果。警报按顺序接收每次计算结果，因此中间的上穿或收盘帧不会被更新的快照替代。
- `barstate.prevPrice` 读取同一根 K 线上一次实时更新价。实时首笔与历史计算返回 `undefined`。`close[0]` 是当前 K 线的最新价格。
- 指标和警报共用计算输出。警报事件随 `alerts` 返回，只有本次更新的实时末根可以产出事件。
- `CalculationDefinition.identity` 直接取自定义注册表的元数据对象；同一对象表示同一份实现，计算器跨修订复用，替换定义则换新身份并销毁旧会话。

## 脚本与规则

- `defineAlert({ version, name, frequency, title?, info?, onBar })` 声明警报。频率由脚本声明并贯穿目录与规则求值。编译器检查源码是否有直接的 `alert()` 调用，运行时按条件执行。
- 指标与警报各有一份选择器投影。规则的 `script` 字段引用稳定定义 ID 和参数覆盖项。计算使用最新的脚本默认值。警报文档只接受当前版本，不做旧字段迁移。
- `once` 在首次接受事件后终止，状态随规则保存。`per-bar` 每根 K 线接受第一条事件。`all` 接受每条事件。`per-bar-close` 保留当前 K 线最后一条事件，在收到同一根 K 线的收盘帧时结算。
- 新建、编辑和启用规则后，从下一次行情更新开始消费事件。停用规则仍然引用脚本。默认工作区在删除脚本或文件夹前检查规则引用。
- 服务记录已触发事件，并按规则渠道投递。图表卡片订阅 `in-app`；声音订阅 `sound`，需要在规则上显式开启，浏览器允许播放后生效。其他宿主可通过 `subscribeNotifications` 接入。
