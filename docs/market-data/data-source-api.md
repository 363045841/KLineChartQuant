# 注册数据源

Vue 产品公开 `MarketDataSource` 和 `createMarketDataHost()`。历史文件、数据库、回放与实时连接都实现同一接口。用户不操作 Buffer，也不向工作台传入行情数组。

```ts
import { createMarketDataHost, type MarketDataSource } from '@363045841yyt/klinechart'

const host = createMarketDataHost()
const source: MarketDataSource = {
  id: 'broker',
  name: '我的行情',
  capabilities: {
    assetClasses: ['stock'],
    bars: { periods: ['daily', '1min'], adjustments: ['none'] },
  },
  instruments: {
    search: query => api.searchInstruments(query),
    resolve: (id, signal) => api.resolveInstrument(id, signal),
  },
  bars: {
    fetch: request => api.getHistory(request),
    subscribe(request, observer) {
      return api.subscribeBars(request, {
        onBar: bar => observer.update(bar),
        onCorrection: bar => observer.update(bar, { historical: true }),
        onReset: () => observer.invalidate(),
        onStatus: status => observer.status(status),
        onError: error => observer.error(error),
      })
    },
  },
}

const unregister = host.registerDataSource(source)
```

示例中的 `api` 由应用实现。`subscribe` 返回取消订阅函数；历史数据源直接省略此方法。源级 `liveBars` 由订阅实现派生，如果显式声明就必须与实现一致。单个品种可以声明 `liveBars: false`。

```vue
<KlineWorkbench
  :market-data-context="host"
  :instrument="{ sourceId: 'broker', id: 'stable-instrument-id' }"
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
| `observer.update(bar)` | 完整单根 OHLCV 快照；同末根时间则替换，较新则追加，较旧则报告协议错误；成交量是累计值而非增量 |
| `observer.update(bar, { historical: true })` | 修正已有历史时间点，允许完整重算；不插入缺失历史、不删除旧根 |
| `observer.invalidate()` | 历史删除、整体复权变化或断线无法补齐；缓存重查原窗口并重放查询期间的增量 |
| `observer.status(status)` | `connecting`、`connected`、`disconnected` |
| `observer.error(error)` | 报告订阅错误，网络重连策略仍属于数据源 |

`olderData` 为 `available`、`exhausted` 或 `unknown`，不能用空数组替代覆盖声明。`signal` 用于取消 I/O；运行时另以订阅身份阻止迟到回调写入新会话。序列身份始终包含来源、品种 ID、周期、复权及聚合方式。

`trades`、`depth`、`timeShare`、`timeShareRange`、`tradingCalendar` 直接复用现有聚合协议的可选接口。

## 职责与验收

公开类型集中在 `data/provider/types.ts`。`registeredDataSource.ts` 只做 Provider 接口翻译、取消和回调资格管理，不缓存行情、不操作 Buffer。`MarketDataContext` 注册和释放，`MarketDataCache` 管历史分页及重查，`MarketRuntime` 管订阅使用权、增量写入和重查期间的事件顺序。Buffer 只保存事实和发布变更。

隔离消费验收也注册数据源，实际验证历史查询、末根更新、新根追加、脚本运行和卸载释放，不使用旁路数组注入。

内置 mock 同样实现此接口，自建宿主用 `host.registerDataSource(createMockDataSource())` 注册。默认宿主 `defaultMarketDataContext` 在加载时已内置一个 mock 来源，不要对它重复注册：同名来源重复注册会抛 `INVALID_STATE`。每个实例独立持有 `MOCK-100` 与 `MOCK-10000` 的历史，历史页遵守数量及排他游标约束；实时订阅只调用 `observer.update(bar)`。注销来源或释放宿主会停止计时器。两组历史均截止当前 UTC 日，不生成未来 K 线。
