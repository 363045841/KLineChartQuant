本快速开始无需任何后端：图表直接渲染你通过 `customData` 传入的数据。只有使用[数据源](#-数据源)中的实时数据源时才需要启动后端。

### 1. 安装

```bash
npm install @363045841yyt/klinechart @363045841yyt/klinechart-core
```

对等依赖：`vue`（^3.4）和 `@363045841yyt/klinechart-agent-runtime`。npm 7+ 会自动安装；使用 pnpm 或 Yarn 时请显式添加。

### 2. 在 `main.ts` 中引入样式

```typescript
import '@363045841yyt/klinechart/style.css'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

### 3. 在 `App.vue` 中渲染图表

示例在代码中生成 30 根日线数据，可直接运行：

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

  /** 30 根日线示例数据。替换为你自己的 KLineData[]（按时间升序）。 */
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

### 4. 接入自己的数据

`customData` 接收 `CustomDataSource`，完全绕过数据源管线，不需要数据请求器或后端。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `data` | `KLineData[]` | 是 | 主图 K 线，按时间升序 |
| `symbol` | `string` | 否 | 品种代码，显示在标题和品种目录中 |
| `market` | `MarketId` | 否 | 用于解释时间戳的市场时段（时区、交易时间）。内置值：`'CN'`、`'HK'`、`'KR'`、`'US'`、`'MT5'`；其他标识需先通过 `marketSessions` 属性（Core 中为 `createChartController` 的 `marketSessions` 选项）注册。默认 `'MT5'`（UTC 00:00–24:00 连续时段） |
| `period` | `string` | 否 | K 线周期：`'1min'`、`'5min'`、`'15min'`、`'30min'`、`'60min'`、`'4h'`、`'daily'`（默认）、`'weekly'`、`'monthly'`、`'quarterly'`、`'yearly'` |
| `adjust` | `string` | 否 | 序列的复权标识：`'none'`（默认）、`'qfq'`、`'hfq'`、`'splits'`。数据按原样绘制，不会重新计算 |
| `description` / `exchange` / `source` | `string` | 否 | 品种目录中的展示信息 |
| `comparisons` | `Record<string, KLineData[]>` | 否 | 对比品种数据，以品种代码为键 |

每根 `KLineData`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `timestamp` | `number` | 是 | K 线开始时间，Unix 时间戳（**毫秒**） |
| `open` / `high` / `low` / `close` | `number` | 是 | 开高低收价格 |
| `volume` | `number` | 否 | 成交量 |
| `turnover`、`changePercent`、`changeAmount`、`amplitude`、`turnoverRate` | `number` | 否 | 可选扩展字段 |

**插槽用法 — 自定义 Tooltip：**

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

**插槽用法 — 自定义主图左上角图例：**

提供 `#legend` 时完全替换 Canvas 默认图例；作用域为完整 `LegendTemplateContext`（OHLC、分时、主图指标、对比品种、布局与颜色）。

```vue
<template #legend="{ index, currentBar, timeshare, indicators, comparisons, colors }">
  <div class="my-legend">
    <!-- PR #98 为 KLineData[] 添加的自定义字段会展开通过 currentBar 暴露 -->
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

    <!-- 使用主图指标图例数据 -->
    <div v-for="indicator in indicators" :key="indicator.name" class="my-legend__row">
      <span>{{ indicator.name }}:</span>
      <template v-for="value in indicator.values" :key="value.label">
        <span :style="{ color: value.color }">
          {{ value.label }} {{ value.value.toFixed(3) }}
        </span>
      </template>
    </div>
    <!-- 使用比较商品数据 -->
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
