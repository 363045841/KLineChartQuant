# Binance 永续接入数据层

`Binance-Connector` 同时提供现货与永续（USDT 本位永续）两个市场。本文件记录 KCQ 侧接入永续的契约与边界；连接器如何采集不在本文范围。

## 品种身份

永续品种的 `instrument.id` 携带市场段：`binance:spot:BTCUSDT` 与 `binance:perp:BTCUSDT`。市场身份的唯一事实来源就是 id 的市场段，展示、搜索、路由都从它派生。

`InstrumentType` 保持 `crypto` 不变，不新增 `perpetual`。理由：`InstrumentType` 表达**资产类别**（股票/指数/基金/期货/期权/外汇/加密），永续是**合约形态**，两者正交；若把合约形态塞进资产类别枚举，同一份事实会同时存在于 `id` 的市场段与新枚举值两处，成为第二套事实来源。展示层也不需要新枚举——`formatInstrumentLabel` 已能从 `providerRef.market` 派生市场标签。

将来若合约形态需要一等公民，应单独建立 `ContractType = spot | perp | delivery`，并在上游先开 issue 讨论，而不是扩张 `InstrumentType`。

## 市场时段

连接器按市场下发 `sessionId`：现货为 `BINANCE_SPOT`，永续为 `BINANCE_PERP`。KCQ 内置两个会话配置（`foundation/config/marketSession/binanceSpotMarketSession.ts`、`binancePerpMarketSession.ts`），两者都是 UTC、每日 `[0, 1440)` 分钟、一周七天连续交易——永续没有结算休市。二者共用同一份时段数值但保留不同 id，因为 id 是连接器与前端之间的身份契约，不因当前取值相同而合并。

## 单 symbol 成交流的市场参数

K 线、逐笔范围查询等端点都有完整的品种对象可用，市场由 `instrumentId` 决定。只有单 symbol 的 SSE 实时流（`GET /sources/{sourceId}/trades/stream?symbol=…`）没有品种 ID，必须用查询参数 `market` 显式标明市场；连接器缺省按现货订阅。

该参数取自 `instrument.providerRef.market`，由 `buildTradeStreamUrl` 原样回传，客户端不解析、不推断、不补默认值。`providerRef` 的契约就是「客户端只负责原样带回服务端下发的值」；服务端仍以 `instrumentId` 为准，并在两者不一致时拒绝请求。因此这里不是第二套事实来源，而是同一事实在无 id 端点的传输通道。

非字符串的 `providerRef` 值（契约允许 `number` / `boolean`）与空白值都不写入参数，交由服务端按缺省现货处理——这类品种本来就不来自 Binance。

## 明确不做

- 不在协议层新增 `funding` / `openInterest` 字段。连接器已在 `PerpCapabilities` 中声明 `funding` 与 `openInterest`，但 KCQ 目前没有消费方，无法用测试证明其正确性；接入前不扩协议。
- 不改 `packages/vue` 的公共 API：永续与现货走同一条 `DataSource.Binance` 链路，差异只在 id 与 `providerRef`。

## 验证

`buildTradeStreamUrl` 的单元测试覆盖：现货/永续各自带出 `market`、缺 `providerRef`、`providerRef` 无 `market`、非字符串值、空白值、`sourceId` 路径编码。类型检查与数据层、市场会话测试共同保证改动的完整性。
