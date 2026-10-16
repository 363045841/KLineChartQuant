No backend is needed for this Quick Start: the chart renders the data you pass in through `customData`. Backends are only needed for the live data sources listed under [Data Sources](#-data-sources).

### 1. Install

```bash
npm install @363045841yyt/klinechart @363045841yyt/klinechart-core
```

Peer dependencies: `vue` (^3.4) and `@363045841yyt/klinechart-agent-runtime`. npm 7+ installs them automatically; with pnpm or Yarn, add them explicitly.

### 2. Import the stylesheet in `main.ts`

```typescript
import '@363045841yyt/klinechart/style.css'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

### 3. Render a chart in `App.vue`

This sample generates 30 daily bars in code, so it runs as-is:

```vue
<template>
  <div class="app-container" :data-theme="currentTheme">
    <KlineChart v-model:theme="currentTheme" :custom-data="customData" :settings="chartSettings" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import type { ChartSettings } from '@363045841yyt/klinechart-core'
  import { type CustomDataSource, type KLineData, KlineChart } from '@363045841yyt/klinechart'

  /** 30 daily sample bars. Replace with your own KLineData[] (oldest first). */
  function createSampleBars(count = 30): KLineData[] {
    const dayMs = 24 * 60 * 60 * 1000
    const start = Date.UTC(2025, 11, 15)
    let close = 100
    return Array.from({ length: count }, (_, i) => {
      const open = close
      close = Math.round((open + Math.sin(i / 3) * 3 + ((i % 5) - 2)) * 100) / 100
      return {
        timestamp: start + i * dayMs,
        open,
        high: Math.max(open, close) + 1.5,
        low: Math.min(open, close) - 1.5,
        close,
        volume: 10_000 + (i % 7) * 1_500,
      }
    })
  }

  const currentTheme = ref<'light' | 'dark'>('dark')

  const customData = ref<CustomDataSource>({
    symbol: 'DEMO',
    period: 'daily',
    data: createSampleBars(),
  })

  const chartSettings: ChartSettings = {
    showGridLines: true,
    isAsiaMarket: true,
    mainLeftAxisDisplaySetting: 'none',
    theme: 'dark',
    colorPresetSettings: {
      dark: {
        candleUpBody: '#e85d04',
        candleDownBody: '#1b4332',
        crosshairLine: '#faa307',
        gridMajor: '#3e2723',
      },
    },
  }
</script>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 80vh;
  }

  .app-container[data-theme='dark'] {
    background: #000;
    color: #e5e7eb;
  }
</style>
```

### 4. Bring your own data

`customData` takes a `CustomDataSource`. It bypasses the data-source pipeline, so no fetcher or backend is involved.

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | `KLineData[]` | yes | Main-chart bars, sorted oldest first |
| `symbol` | `string` | no | Symbol code shown in the header and symbol catalog |
| `market` | `MarketId` | no | Market session used to read timestamps (time zone, trading hours). Built-in: `'CN'`, `'HK'`, `'KR'`, `'US'`, `'MT5'`. Other ids must first be registered through the `marketSessions` prop (Core: the `marketSessions` option of `createChartController`). Defaults to `'MT5'` (a continuous 00:00–24:00 UTC session) |
| `period` | `string` | no | K-line period: `'1min'`, `'5min'`, `'15min'`, `'30min'`, `'60min'`, `'4h'`, `'daily'` (default), `'weekly'`, `'monthly'`, `'quarterly'`, `'yearly'` |
| `adjust` | `string` | no | Adjustment key for the series: `'none'` (default), `'qfq'`, `'hfq'`, `'splits'`. Your bars are drawn as given; nothing is recalculated |
| `description` / `exchange` / `source` | `string` | no | Labels for the symbol catalog |
| `comparisons` | `Record<string, KLineData[]>` | no | Comparison series keyed by symbol |

Each `KLineData` bar:

| Field | Type | Required | Description |
|---|---|---|---|
| `timestamp` | `number` | yes | Bar open time, Unix epoch **milliseconds** |
| `open` / `high` / `low` / `close` | `number` | yes | OHLC prices |
| `volume` | `number` | no | Volume |
| `turnover`, `changePercent`, `changeAmount`, `amplitude`, `turnoverRate` | `number` | no | Optional extra fields |

**Slot Usage — Custom Tooltip:**

```html
<KlineChart>
  <template #kline-tooltip="{ hoverData, upColor, downColor }">
    <div class="custom-tooltip">
      <div class="custom-tooltip__title">
        <span>{{ hoverData.stockCode }}</span>
        <span>{{ formatTimestamp(hoverData.timestamp, { timeZone: 'Asia/Shanghai' }) }}</span>
      </div>
      <div
        class="custom-tooltip__price"
        :style="{ color: hoverData.close >= hoverData.open ? upColor : downColor }"
      >
        {{ hoverData.close.toFixed(2) }}
      </div>
      <div class="custom-tooltip__detail">
        O: {{ hoverData.open.toFixed(2) }}<br />
        H: {{ hoverData.high.toFixed(2) }}<br />
        L: {{ hoverData.low.toFixed(2) }}<br />
        C: {{ hoverData.close.toFixed(2) }}
      </div>
    </div>
  </template>
</KlineChart>
```

**Slot Usage — Custom Main-Pane Legend:**

Providing `#legend` fully replaces the default Canvas legend. The slot scope is the full `LegendTemplateContext` (OHLC, timeshare, main indicators, comparisons, layout, colors).

```vue
<template #legend="{ index, currentBar, timeshare, indicators, comparisons, colors }">
  <div class="my-legend">
    <!-- Custom fields added to KLineData[] for PR #98 are exposed through currentBar -->
    <div v-if="currentBar" class="my-legend__row">
      <span :style="{ color: currentBar.color }">
        开盘 {{ currentBar.open.toFixed(2) }} 最高 {{ currentBar.high.toFixed(2) }} 最低
        {{ currentBar.low.toFixed(2) }} 收盘 {{ currentBar.close.toFixed(2) }}
      </span>
      <span v-if="currentBar.volumeText"> Vol {{ currentBar.volumeText }}</span>
    </div>

    <div v-if="timeshare" class="my-legend__row">
      <span :style="{ color: timeshare.changeColor }">
        现价 {{ timeshare.price.toFixed(2) }} 涨幅 {{ timeshare.changePercent.toFixed(2) }}%
      </span>
    </div>

    <!-- Using main chart indicator legend data -->
    <div v-for="indicator in indicators" :key="indicator.name" class="my-legend__row">
      <span>{{ indicator.name }}:</span>
      <template v-for="value in indicator.values" :key="value.label">
        <span :style="{ color: value.color }">
          {{ value.label }} {{ value.value.toFixed(3) }}
        </span>
      </template>
    </div>
    <!-- Using comparison commodity data -->
    <div
      v-for="comparison in comparisons"
      :key="comparison.symbol"
      class="my-legend__row"
      :style="{ color: comparison.percentColor }"
    >
      {{ comparison.symbol }}
      {{ comparison.percent > 0 ? '+' : '' }}{{ comparison.percent.toFixed(2) }}%
    </div>
  </div>
</template>
```

### Host toolbar controls

Use `#toolbar-start` and `#toolbar-end` to place host account or workspace
controls in the native toolbar. Both slots are optional and inherit the
resolved chart theme. They stay outside the draggable, scrolling chart controls.

```vue
<KlineChart>
  <template #toolbar-start><AccountMenu /></template>
  <template #toolbar-end><WorkspaceActions /></template>
</KlineChart>
```
