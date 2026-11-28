### 1. 安装

产品只有一个包。`vue` 是唯一的 peer 依赖；图表引擎、Agent 运行时、脚本引擎、编辑器页、Web Worker、公开类型、样式与许可证声明都在 tarball 内。

```bash
pnpm add @363045841yyt/klinechart vue
# npm install @363045841yyt/klinechart vue
# yarn add @363045841yyt/klinechart vue
```

不需要安装任何 `@363045841yyt/klinechart-*` 内部包：它们不对外发布。v0.11 处于 alpha 阶段，当前请安装 `alpha` dist-tag（`pnpm add @363045841yyt/klinechart@alpha vue`）或固定具体版本。

在应用入口引入一次产品样式：

```ts
import '@363045841yyt/klinechart/style.css'
```

### 2. 挂载工作台

```vue
<script setup lang="ts">
import { createPersistedMarketDataHost, KlineWorkbench, provideBrowserAppRuntime } from '@363045841yyt/klinechart'
import { onScopeDispose } from 'vue'

const host = createPersistedMarketDataHost()
provideBrowserAppRuntime(host.context, true, console.error)
onScopeDispose(host.dispose)
</script>

<template>
  <div style="height: 700px">
    <KlineWorkbench />
  </div>
</template>
```

工作台会铺满容器（`width/height: 100%`），宿主元素必须给出明确高度。

- 应用根调用一次 `provideBrowserAppRuntime`，第二个参数决定是否启动脚本服务。工作台的 `scripts` 和 `agent` 参数分别控制编辑器入口与 Agent 面板。
- `chart` 转发图表配置（坐标轴、工具栏、`settings.theme`、`settings.rendererBackend` 等）。
- `initialAgentPanelOpen` 控制 Agent 抽屉是否初始展开。
- 内置脚本指标会在图表挂载前准备；编辑器页与语言服务只在打开编辑器时加载。
- 高级 Agent 接口在同一包的 `@363045841yyt/klinechart/agent` 子入口。

### 3. 提供行情

图表不接受 K 线数组。应用实现 `MarketDataSource`，注册到宿主自己创建的行情实例，再把该实例传给工作台。

```ts
import {
  InstrumentType,
  KLineAdjustment,
  KLinePeriod,
  createMarketDataHost,
  type DataSourceInstrument,
  type HistoryRequest,
  type MarketDataSource,
  type StreamTransport,
} from '@363045841yyt/klinechart'

// `api` 与 `toInstrument` 代表你的后端适配层与数据映射（HTTP、WebSocket、文件或数据库皆可）。
const instrument: DataSourceInstrument = {
  id: 'BTCUSDT',
  symbol: 'BTCUSDT',
  name: 'Bitcoin / USDT',
  exchange: 'BINANCE',
  instrumentType: InstrumentType.Crypto,
  timezone: 'UTC',
  capabilities: {
    bars: { periods: [KLinePeriod.Min1, KLinePeriod.Daily], adjustments: [KLineAdjustment.None] },
    liveBars: true,
  },
}

const source: MarketDataSource = {
  id: 'binance',
  name: 'Binance Spot',
  capabilities: {
    instrumentTypes: [InstrumentType.Crypto],
    bars: { periods: [KLinePeriod.Min1, KLinePeriod.Daily], adjustments: [KLineAdjustment.None] },
    liveBars: true,
  },
  instruments: {
    // 支撑品种搜索与切换。
    async search(query) {
      const matches = await api.searchSymbols(query.keyword, query.limit, query.signal)
      return matches.map(toInstrument)
    },
    // 按稳定 ID 还原身份与能力。
    async resolve(id, signal) {
      return toInstrument(await api.getSymbol(id, signal))
    },
  },
  bars: {
    // 历史分页：beforeTimestamp 是排他上界，省略表示最新一页。
    async fetch(request: HistoryRequest) {
      const page = await api.getKlines({
        symbol: request.instrument.id,
        period: request.period,
        before: request.beforeTimestamp,
        limit: request.limit,
        signal: request.signal,
      })
      return { bars: page.bars, olderData: page.olderData }
    },
    // 可选实时流：返回一次性传输，连接与重连由图表统一管理。
    stream(request, handlers): StreamTransport {
      let seq = 0
      const socket = api.subscribeBars(request.instrumentIds, request.period, {
        onBar: (instrumentId, bar, state) =>
          handlers.onFrame({
            type: 'bar',
            seq: seq++,
            ts: Date.now(),
            instrumentId,
            state,
            bar,
          }),
        onSnapshot: (instrumentId, bars) =>
          handlers.onFrame({ type: 'snapshot', seq: seq++, ts: Date.now(), instrumentId, bars }),
        onClose: (message) => handlers.onClose({ retryable: true, message }),
      })
      return {
        open() {
          handlers.onOpen()
        },
        close() {
          socket.close()
        },
      }
    },
  },
}

const host = createMarketDataHost()
const unregister = host.registerDataSource(source)
```

在应用根提供注册好的行情宿主，再把选中的品种传给工作台。

```vue
<script setup lang="ts">
import { KlineWorkbench, provideBrowserAppRuntime } from '@363045841yyt/klinechart'

provideBrowserAppRuntime(host, true, console.error)
const instrument = { source: 'binance', id: 'BTCUSDT' }
</script>

<template>
  <div style="height: 700px">
    <KlineWorkbench
      :instrument="instrument"
      period="daily"
    />
  </div>
</template>
```

数据契约：

- `bars.fetch` 返回 `{ bars, olderData }`。K 线为 UTC 毫秒 OHLCV，按时间升序；`beforeTimestamp` 为排他上界，`limit` 为请求页大小。
- `olderData` 只能是 `available`、`exhausted` 或 `unknown`，必须显式声明；不能用空数组表示“没有更多历史”。
- `stream(request, handlers)` 提供一次性传输：`open` / `close` 与 `onOpen` / `onFrame` / `onClose`；连接、重连与存活判断由图表统一管理，数据源不实现重连。
- 帧协议固定为 V1.1：`hello / snapshot / bar / quote / status / ping / error`，统一信封 `{ type, seq, ts }`；增量帧自带 `state: 'forming' | 'closed'`，不再依赖成对到达。
- 源级 `liveBars` 由 `stream` 实现派生；单个品种可以声明 `liveBars: false`。
- `instrument` 与 `period` 是受控属性，修改即切换序列。
- 宿主生命周期归应用所有：`unregister()` 注销单个来源，`host.dispose()` 释放全部资源；卸载工作台不会销毁宿主。
- 本地开发没有后端时，注册内置 mock：`host.registerDataSource(createMockDataSource())`（MOCK）。默认宿主已内置该来源，不要重复注册。

包含逐笔、盘口、分时与交易日历接口的完整契约见[数据源 API]({{root}}docs/market-data/data-source-api.md)。

### 许可证

完整产品包含 AGPL-3.0-or-later 脚本模块，按 AGPL-3.0-or-later 交付。内部 Apache-2.0 模块保留各自许可证；模块与第三方声明随包发布。
