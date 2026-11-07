# 品种标识与市场映射

## 背景

各 connector 自己拼 `instrument.id`，格式并不统一：

| 数据源 | `id` 实例 | 段数 |
| --- | --- | --- |
| Binance | `binance:spot:BTCUSDT` | 3 |
| MT5 | `mt5:XAUUSD` | 2 |
| GOTDX | `gotdx:stock:1:600519` | 4 |

在建 Binance 永续之前，前端已经有四个地方各自拼「身份键」：

- `packages/core/src/data/provider/impl/instrumentSearch.ts` 用 `${sourceId}:${id}` 去重
- `packages/core/src/engine/data/symbolIdentity.ts` 用 `instrument:${sourceId}:${id}`
- `packages/vue/src/composables/symbol/useSymbolSearch.ts` 同上
- `packages/vue/src/components/chart/KLineChart.vue` 的 `legacyInstrumentId` 再拼一套 source/exchange/symbol/params

因为 `id` 本身已经带 `sourceId` 前缀，前三条实际生成 `binance:binance:spot:BTCUSDT` 这样的双层前缀。这不是命名风格问题：一旦永续进来，同一个 `BTCUSDT` 会出现 `binance:spot:BTCUSDT` 与 `binance:perp:BTCUSDT` 两个 id，靠拼接区分市场的做法会立刻分叉出更多变体。

## 决策

1. **`instrument.id` 是全局唯一标识，其第一段必须等于 `sourceId`。**
   Connector 负责保证；核心层只做前缀断言，不解析尾段。

2. **身份键就是 `id` 本身，禁止再拼 `sourceId`。**
   `sourceId` 是路由与配置维度（决定连哪个 connector、读哪份配置），不参与身份。

3. **`id` 的尾段语法由各 connector 拥有，核心层不得解读。**
   Binance 是 `<market>:<symbol>`，MT5 没有市场段，GOTDX 是 `<kind>:<key>:<symbol>`。
   强行统一成一种语法会把「多一层市场」的需求塞进所有数据源。

4. **`.P` 永不写入 `id`，只在「搜索/粘贴入口」与「展示输出」两处出现。**
   `id` 与 `symbol` 都是裸代码（`BTCUSDT`），市场维度由 `providerRef.market` 承载。
   `.P` 是 TradingView 对永续的展示惯例，用户的肌肉记忆和从 TV 抄来的文本都带它，
   所以它在输入端被还原为市场限定，在输出端被重新生成。

5. **展示层沿用 `.P`，不再另造徽标。**
   图表标题、搜索列表、自选列表都显示 `BTCUSDT.P`。理由：
   显示与输入用同一套语法，用户不需要学两套；沉淀下来的文本（截图、笔记、自选配置的
   人读形式）可以直接粘回 TradingView。

   > 决策 5 推翻了本文档初版「展示靠徽标、不改代码字符串」的口径。初版的顾虑是
   > 「展示形式渗进标识」——这个顾虑由决策 4 的边界（只在出入口，不进 `id`）解决，
   > 不必通过禁止展示形式来达成。

## 映射规则

| TradingView | KCQ `instrument.id` | `providerRef` |
| --- | --- | --- |
| `BTCUSDT` | `binance:spot:BTCUSDT` | `{symbol: "BTCUSDT", market: "spot"}` |
| `BTCUSDT.P` | `binance:perp:BTCUSDT` | `{symbol: "BTCUSDT", market: "perp"}` |
| `ETHBTC` | `binance:spot:ETHBTC` | `{symbol: "ETHBTC", market: "spot"}` |
| `XAUUSD` | `mt5:XAUUSD` | `{symbol: "XAUUSD"}` |

规则：

- **输入**：用户粘贴 `BTCUSDT.P` 时，`parseInstrumentQuery` 去掉 `.P` 得到 `BTCUSDT`，
  并把市场维度置为 `perp`；不带后缀的 `BTCUSDT` 不带市场维度，沿用数据源缺省（Binance 是现货）。
  解析只发生在搜索入口这一处，且只认结尾的 `.P`（大小写不敏感），不会误伤 `0700.HK` 这类
  以字母结尾的正常代码——`.P` 是两字符后缀，`0800.HK` 不会命中。
- **存储**：只存 `id`，不存 `.P`。
- **输出**：图表标题、搜索列表、自选列表、tooltip 都显示 `formatInstrumentLabel().code`，
  永续即 `BTCUSDT.P`。
- **跨品种引用**（结构层的参考品种）：写 `binance:perp:BTCUSDT`，
  与主品种 `binance:spot:BTCUSDT` 是两个不同的 `instrumentId`。

## 唯一实现

核心层提供四个函数，其余模块不得自行拼接或解析：

```ts
// 身份键：直接返回 id，只做前缀断言
export function instrumentIdentityKey(instrument: { id: string; sourceId: string }): string

// 断言（开发期与反序列化入口调用），返回是否合法
export function isInstrumentIdOfSource(id: string, sourceId: string): boolean

// 展示：代码 + 市场；永续的 code 带 `.P`
export function formatInstrumentLabel(
  instrument: Pick<InstrumentDescriptor, 'symbol' | 'providerRef'>,
): { code: string; market?: string }

// 输入解析：`BTCUSDT.P` → `{ keyword: 'BTCUSDT', market: 'perp' }`
export function parseInstrumentQuery(input: string): InstrumentQuery
```

- `instrumentIdentityKey` 取代上述四处实现。
- `formatInstrumentLabel` 的 `market` 取 `providerRef.market`，`code` 在
  `market === 'perp'` 时追加 `.P`；`symbol` 本体始终不含后缀，
  因此任何带 `.P` 的脏数据都会在展示时暴露成 `BTCUSDT.P.P`，而不是被静默隐藏。
- `parseInstrumentQuery` 是输入侧的唯一解析点，`searchInstruments` 与
  `lookupInstrumentsBySymbol` 都经过它，调用方不需要自己剥后缀。
- 旧的 `legacyInstrumentId`（为没有稳定 id 的旧目录条目兜底）保留，但只在
  `id` 缺失时使用；一旦 provider 返回 `id`，绝不进入该分支。

## 影响

- `packages/core/src/data/provider/impl/instrumentSearch.ts`：去重键改为 `id`；
  搜索与精确查找统一经过 `parseInstrumentQuery`，并把 `market` 透传给 connector。
- `packages/core/src/data/provider/types.ts` / `protocol/types.ts` / `protocol/impl/httpTransport.ts`：
  `InstrumentSearchQuery` 与协议请求新增可选 `market`，缺省时沿用数据源缺省市场。
- `packages/core/src/engine/data/symbolIdentity.ts`：`instrument:` 前缀消失，
  比较/图表缓存的身份键跟着变，需要同步更新快照类测试的期望值。
- `packages/vue/src/composables/symbol/useSymbolSearch.ts`：与核心共用同一函数。
- `packages/vue/src/composables/watchlist/*`：自选去重依赖 `symbolIdentityKey`，
  改动后「同一代码不同市场」会被正确视为两个条目。
- 展示侧消费 `formatInstrumentLabel().code` 的位置：`SymbolSelector.vue`（列表与
  当前品种 chip）、`CompareSymbolSelector.vue`（已添加列表与搜索结果）、
  `WatchlistPanel.vue`（行的视图模型 `code`）、`KLineChart.vue`（标题与截图文件名）、
  `useKLineTooltip.ts` + `KLineTooltip.vue`（tooltip 标题）、
  `chartAgentController.ts` 的 `createContext()`（Agent 上下文快照的 `symbol`，
  由 `AgentContextBar.vue` 渲染成底部芯片）。
  自选图标的首字母与色板仍取裸 `symbol`，让现货与永续同色同字母。
- Binance connector 侧对应 `internal/model/markets.go` 的
  `InstrumentID(market, symbol)` / `SymbolFromInstrumentID(value)`，两端格式必须一致。

## 验证

- `instrument.id` 的前缀断言在 provider 返回目录时触发一次，覆盖 spot/perp 两市场。
- 永续与现货的 `BTCUSDT` 在同一份自选列表里共存且互不覆盖。
- 粘贴 `BTCUSDT.P` 后加载的是 `binance:perp:BTCUSDT`，标题显示 `BTCUSDT.P`。
- `0700.HK` 这类以字母结尾的正常代码不会被误解析成永续。
- 既有的 `symbolIdentityKey` / `symbolSpecIdentityKey` 测试同步改为新期望值。
- 展示层一致性：同一品种在搜索列表、图表标题、tooltip、自选列表、对比列表、
  Agent 上下文芯片、截图文件名里显示同一个 `BTCUSDT.P`。
