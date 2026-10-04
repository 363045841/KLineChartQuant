# 统一行情 Provider 使用示例

统一行情模型由前端定义。Provider 负责把数据源私有协议转换为标准品种、K 线和分时结果，图表与 UI 不解析 `providerRef`。

图表运行时只通过 `MarketDataProvider` 与 `SourceRouter` 取数。自定义数据仍可用 `setData` / `applyCustomData` 注入。

## 定义品种

```ts
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'

const instrument = {
  id: 'gotdx:stock:0:000001',
  sourceId: 'gotdx',
  symbol: '000001',
  name: '平安银行',
  assetClass: 'stock',
  exchange: 'SZ',
  sessionId: 'CN',
  currency: 'CNY',
  lotSize: 100,
  providerRef: {
    market: 0,
    kind: 'stock',
  },
  capabilities: {
    bars: {
      periods: ['1min', '5min', 'daily', 'weekly'],
      adjustments: ['qfq', 'hfq', 'none'],
    },
    timeShare: true,
  },
} as const satisfies InstrumentDescriptor
```

`id` 是品种身份的唯一依据。`providerRef` 只交给创建它的 Provider，搜索、UI、图表和比较功能不得读取其中字段。

## 实现 Provider

Provider 按能力组合模块，不支持的能力不挂载对应属性。

```ts
import type { MarketDataProvider } from '@363045841yyt/klinechart-core/market-data'

const provider = {
  source: {
    id: 'gotdx',
    displayName: 'GOTDX',
  },

  async probe() {
    return {
      status: 'online',
      checkedAt: Date.now(),
    }
  },

  catalog: {
    async search(query) {
      // Adapter 在这里把 GOTDX 搜索结果转换为 InstrumentDescriptor。
      return query.keyword ? [instrument] : []
    },
  },

  bars: {
    async fetch(query) {
      // Adapter 在这里使用 query.instrument.providerRef 请求 GOTDX。
      return {
        instrumentId: query.instrument.id,
        period: query.period,
        adjustment: query.adjustment,
        timezone: 'Asia/Shanghai',
        volumeUnit: 'share',
        data: [],
      }
    },
  },
} satisfies MarketDataProvider
```

## 注册与配置

默认注册表只保存当前会话配置，应用层负责 localStorage 等持久化。

```ts
import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/market-data'

marketDataProviderRegistry.register(provider, {
  enabled: true,
  baseUrl: 'http://127.0.0.1:8080',
})

marketDataProviderRegistry.setConfig('gotdx', {
  enabled: false,
})

const enabledProviders = marketDataProviderRegistry.getEnabled()
```

## 前端消费规则

1. 周期和复权选项读取 `instrument.capabilities.bars`。
2. 只有 `timeShare === true` 且 `sessionId` 已注册时才允许进入分时模式。
3. K 线和分时请求使用完整的 `InstrumentDescriptor`，不重新拼装数据源参数。
4. 成交量展示读取序列的 `volumeUnit`，不默认所有市场都使用“手”。
5. Provider 的可选模块是能力事实来源，不再使用任意字符串组成的 capability 列表。

完整设计与迁移范围见 [GitHub Issue #116](https://github.com/363045841/KLineChartQuant/issues/116)。
