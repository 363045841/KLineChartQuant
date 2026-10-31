### 1. Install

The product is one package. `vue` is the only peer dependency; the chart engine, Agent runtime, script engine, editor page, Web Workers, public types, stylesheet, and license notices are all inside the tarball.

```bash
pnpm add @363045841yyt/klinechart vue
# npm install @363045841yyt/klinechart vue
# yarn add @363045841yyt/klinechart vue
```

No `@363045841yyt/klinechart-*` internal package is published or needs to be installed. While v0.11 is in alpha, install the `alpha` dist-tag (`pnpm add @363045841yyt/klinechart@alpha vue`) or pin an exact version.

Import the product stylesheet once in your app entry:

```ts
import '@363045841yyt/klinechart/style.css'
```

### 2. Mount the workbench

```vue
<script setup lang="ts">
import { KlineWorkbench } from '@363045841yyt/klinechart'
</script>

<template>
  <div style="height: 700px">
    <KlineWorkbench />
  </div>
</template>
```

The workbench fills its container (`width/height: 100%`), so the host element must have an explicit size.

- `agent` and `scripts` default to `true`. Both are decided at mount time: set either to `false` (and remount) to disable that subsystem. Disabling scripts means no script execution Worker, no editor entry, and no language service.
- `chart` forwards chart configuration (axes, toolbar, `settings.theme`, `settings.rendererBackend`, …).
- `initialAgentPanelOpen` controls whether the Agent drawer starts open.
- Builtin script indicators are prepared before the chart mounts; the editor page and its language service load only when the editor is opened.
- Advanced Agent APIs live in the same package at `@363045841yyt/klinechart/agent`.

### 3. Provide market data

The chart never accepts a bar array. Implement `MarketDataSource`, register it on a host you own, and pass that host to the workbench.

```ts
import {
  createMarketDataHost,
  type BarsObserver,
  type DataSourceInstrument,
  type HistoryRequest,
  type MarketDataSource,
} from '@363045841yyt/klinechart'

// `api` and `toInstrument` are your backend adapter and payload mapping (HTTP, WebSocket, file reader, database, …).
const instrument: DataSourceInstrument = {
  id: 'BTCUSDT',
  symbol: 'BTCUSDT',
  name: 'Bitcoin / USDT',
  exchange: 'BINANCE',
  assetClass: 'crypto',
  timezone: 'UTC',
  capabilities: {
    bars: { periods: ['1min', 'daily'], adjustments: ['none'] },
    liveBars: true,
  },
}

const source: MarketDataSource = {
  id: 'binance',
  name: 'Binance Spot',
  capabilities: {
    assetClasses: ['crypto'],
    bars: { periods: ['1min', 'daily'], adjustments: ['none'] },
    liveBars: true,
  },
  instruments: {
    // Powers the symbol picker and instrument switching.
    async search(query) {
      const matches = await api.searchSymbols(query.keyword, query.limit, query.signal)
      return matches.map(toInstrument)
    },
    // Resolves the stable id back to identity and capabilities.
    async resolve(id, signal) {
      return toInstrument(await api.getSymbol(id, signal))
    },
  },
  bars: {
    // History pages: `beforeTimestamp` is an exclusive upper bound, omitted means the newest page.
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
    // Optional live stream. Return an unsubscribe function.
    subscribe(request, observer: BarsObserver) {
      observer.status('connecting')
      const socket = api.subscribeBars(request.instrument.id, request.period, {
        onBar: (bar) => observer.update(bar),
        onCorrection: (bar) => observer.update(bar, { historical: true }),
        onReset: () => observer.invalidate(),
        onStatus: (status) => observer.status(status),
        onError: (error) => observer.error(error),
      })
      return () => socket.close()
    },
  },
}

const host = createMarketDataHost()
const unregister = host.registerDataSource(source)
```

Pass the host and the selected instrument to the workbench:

```vue
<script setup lang="ts">
import { KlineWorkbench } from '@363045841yyt/klinechart'

const instrument = { sourceId: 'binance', id: 'BTCUSDT' }
</script>

<template>
  <div style="height: 700px">
    <KlineWorkbench
      :market-data-context="host"
      :instrument="instrument"
      period="daily"
    />
  </div>
</template>
```

Data contract:

- `bars.fetch` returns `{ bars, olderData }`. Bars are UTC-millisecond OHLCV entries in ascending order; `beforeTimestamp` is an exclusive bound and `limit` is the requested page size.
- `olderData` is `available`, `exhausted`, or `unknown`. Declare it explicitly — an empty array is not a substitute for “no more history”.
- `observer.update(bar)` takes a full single-bar snapshot. Same last timestamp replaces, newer appends, older reports a protocol error; `observer.update(bar, { historical: true })` corrects an existing bar; `observer.invalidate()` asks for a reload after deletions or adjustment changes.
- `observer.status('connecting' | 'connected' | 'disconnected')` and `observer.error(error)` report transport state; reconnection stays the data source's responsibility.
- A source-level `liveBars` flag derives from `subscribe`; an individual instrument may declare `liveBars: false`.
- `instrument` and `period` are controlled props: change them to switch the series.
- The host belongs to your app. `unregister()` removes one source and `host.dispose()` releases everything; unmounting the workbench does not dispose the host.
- For local development without a backend, register the built-in mock instead: `host.registerDataSource(createMockDataSource())` (MOCK-100 / MOCK-10000). The default context already contains it, so do not register it twice.

The complete contract, including trades, depth, time-share, and trading-calendar interfaces, is documented in the [data source API]({{root}}docs/market-data/data-source-api.md).

### License

The complete product includes AGPL-3.0-or-later script modules and is distributed under AGPL-3.0-or-later. Individual Apache-2.0 modules retain their original licenses; module and third-party notices ship with the package.
