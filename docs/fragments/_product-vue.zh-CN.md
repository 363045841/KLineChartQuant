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
import { KlineWorkbench } from '@363045841yyt/klinechart'
</script>

<template>
  <div style="height: 700px">
    <KlineWorkbench />
  </div>
</template>
```

工作台会铺满容器（`width/height: 100%`），宿主元素必须给出明确高度。

- `agent` 与 `scripts` 默认开启，且在挂载时确定：设为 `false` 并重新挂载才会禁用对应子系统。关闭脚本后不会创建脚本执行 Worker，也不显示编辑器入口与语言服务。
- `chart` 转发图表配置（坐标轴、工具栏、`settings.theme`、`settings.rendererBackend` 等）。
- `initialAgentPanelOpen` 控制 Agent 抽屉是否初始展开。
- 内置脚本指标会在图表挂载前准备；编辑器页与语言服务只在打开编辑器时加载。
- 高级 Agent 接口在同一包的 `@363045841yyt/klinechart/agent` 子入口。

### 3. 提供行情

图表不接受 K 线数组。应用实现 `MarketDataSource`，注册到宿主自己创建的行情实例，再把该实例传给工作台。

```ts
import {
  createMarketDataHost,
  type BarsObserver,
  type DataSourceInstrument,
  type HistoryRequest,
  type MarketDataSource,
} from '@363045841yyt/klinechart'

// `api` 与 `toInstrument` 代表你的后端适配层与数据映射（HTTP、WebSocket、文件或数据库皆可）。
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
    // 可选实时流；返回取消订阅函数。
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

把宿主与选中的品种传给工作台：

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

数据契约：

- `bars.fetch` 返回 `{ bars, olderData }`。K 线为 UTC 毫秒 OHLCV，按时间升序；`beforeTimestamp` 为排他上界，`limit` 为请求页大小。
- `olderData` 只能是 `available`、`exhausted` 或 `unknown`，必须显式声明；不能用空数组表示“没有更多历史”。
- `observer.update(bar)` 提交完整单根快照：末根时间相同则替换，较新则追加，较旧按协议错误处理；`observer.update(bar, { historical: true })` 修正已有历史；`observer.invalidate()` 在删除历史或复权变化后请求重查。
- `observer.status('connecting' | 'connected' | 'disconnected')` 与 `observer.error(error)` 上报连接状态；重连策略仍属于数据源。
- 源级 `liveBars` 由 `subscribe` 实现派生；单个品种可以声明 `liveBars: false`。
- `instrument` 与 `period` 是受控属性，修改即切换序列。
- 宿主生命周期归应用所有：`unregister()` 注销单个来源，`host.dispose()` 释放全部资源；卸载工作台不会销毁宿主。
- 本地开发没有后端时，注册内置 mock：`host.registerDataSource(createMockDataSource())`（MOCK-100 / MOCK-10000）。默认宿主已内置该来源，不要重复注册。

包含逐笔、盘口、分时与交易日历接口的完整契约见[数据源 API]({{root}}docs/market-data/data-source-api.md)。

### 许可证

完整产品包含 AGPL-3.0-or-later 脚本模块，按 AGPL-3.0-or-later 交付。内部 Apache-2.0 模块保留各自许可证；模块与第三方声明随包发布。
