# 注册数据源

Vue 产品公开 `MarketDataSource` 和 `createMarketDataHost()`。历史文件、数据库、回放与实时连接都实现同一接口。用户不操作 Buffer，也不向工作台传入行情数组。

```ts
import {
  InstrumentType,
  KLineAdjustment,
  KLinePeriod,
  createMarketDataHost,
  type MarketDataSource,
} from '@363045841yyt/klinechart'

const host = createMarketDataHost()
const source: MarketDataSource = {
  id: 'broker',
  name: '我的行情',
  capabilities: {
    instrumentTypes: [InstrumentType.Stock],
    bars: { periods: [KLinePeriod.Daily, KLinePeriod.Min1], adjustments: [KLineAdjustment.None] },
  },
  instruments: {
    search: query => api.searchInstruments(query),
    resolve: (id, signal) => api.resolveInstrument(id, signal),
  },
  bars: {
    fetch: request => api.getHistory(request),
  },
  // 可选实时流：一次性传输，连接与重连由图表统一管理。
  stream(request, handlers) {
    let seq = 0
    const socket = api.subscribeBars(request.instrumentIds, request.period, {
      onBar: (instrumentId, bar, state) =>
        handlers.onFrame({ type: 'bar', seq: seq++, ts: Date.now(), instrumentId, state, bar }),
      onSnapshot: (instrumentId, bars) =>
        handlers.onFrame({ type: 'snapshot', seq: seq++, ts: Date.now(), instrumentId, bars }),
      onClose: message => handlers.onClose({ retryable: true, message }),
    })
    return {
      open: () => handlers.onOpen(),
      close: () => socket.close(),
    }
  },
}

const unregister = host.registerDataSource(source)
```

示例中的 `api` 由应用实现。`stream` 返回一次性传输；历史数据源直接省略此方法。源级 `liveBars` 由传输实现派生，如果显式声明就必须与实现一致。单个品种可以声明 `liveBars: false`。

```vue
<KlineWorkbench
  :market-data-context="host"
  :instrument="{ source: 'broker', id: 'stable-instrument-id' }"
  period="daily"
/>
```

`instrument` 和 `period` 支持受控切换。宿主实例在挂载时确定，卸载单个工作台不销毁共享宿主。`unregister()` 注销来源，`host.dispose()` 释放整个宿主；应用不需要操作内部注册表或缓存。

## 数据语义

| 方法 | 契约 |
| --- | --- |
| `instruments.search(query)` | 返回品种目录；query 包含关键字、数量、类别筛选和取消信号 |
| `instruments.resolve(id, signal)` | 按稳定 ID 返回身份、交易所、资产类别、时区和能力；分时品种还需交易会话身份 |
| `bars.fetch(request)` | 返回 `{ bars, olderData }`；时间为 UTC 毫秒，升序且唯一；`beforeTimestamp` 为排他上界，不传表示最新页 |
| `stream(request, handlers)` | 可选实时流：一次性传输，提供 `open` / `close` 与 `onOpen` / `onFrame` / `onClose`；连接、重连与存活判断由图表统一管理 |
| 帧协议 | V1.1：`hello / snapshot / bar / quote / status / ping / error`，统一信封 `{ type, seq, ts }`；增量帧自带 `state: 'forming' \| 'closed'` |
| `error` 帧 | 带 `code`、`message` 与 `retryable`；永久错误由服务端用 4xx/204 表达，流内错误只表示可重试故障 |

`olderData` 为 `available`、`exhausted` 或 `unknown`，不能用空数组替代覆盖声明。`signal` 用于取消 I/O；运行时另以订阅身份阻止迟到回调写入新会话。序列身份始终包含来源、品种 ID、周期、复权及聚合方式。

`trades`、`depth`、`timeShare`、`timeShareRange`、`tradingCalendar` 直接复用现有聚合协议的可选接口。

## 职责与验收

公开类型集中在 `data/provider/types.ts`。`registeredDataSource.ts` 只做 Provider 接口翻译、取消和回调资格管理，不缓存行情、不操作 Buffer。`MarketDataContext` 注册和释放；`MarketDataService` 统一持有历史分页、重查、订阅与增量写入，`MarketDataCache` 只作为其中的分页缓存实现。Buffer 只保存事实和发布变更。

隔离消费验收也注册数据源，实际验证历史查询、末根更新、新根追加、脚本运行和卸载释放，不使用旁路数组注入。

内置 mock 同样实现此接口，自建宿主用 `host.registerDataSource(createMockDataSource())` 显式注册。`createMarketDataHost()` 创建的宿主默认没有内置来源；同名来源重复注册会抛 `INVALID_STATE`。每个 mock 实例只提供一个 `MOCK` 品种，历史按 UTC 日索引即时生成：请求哪一页就返回哪一页，`olderData` 恒为 `available`，因此翻到最早一根也不会出现空白。段内价格由锚点与布朗桥给出，相邻 K 线首尾相接，同一日索引在任何宿主、任何取页顺序下都得到同一根 K 线。实时流只推送 `bar` 帧；注销来源或释放宿主会停止计时器。历史截止当前 UTC 日，不生成未来 K 线。
