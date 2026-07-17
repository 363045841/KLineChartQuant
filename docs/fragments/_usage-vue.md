### 3. Install and Use

```bash
npm install @363045841yyt/klinechart @363045841yyt/klinechart-core
```

**Use the component:**

```vue
<template>
  <div class="app-container" :data-theme="currentTheme">
    <KlineChart v-model:theme="currentTheme" :custom-data="customData" :settings="chartSettings" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import type { ChartSettings } from '@363045841yyt/klinechart-core'
  import { type CustomDataSource, KlineChart } from '@363045841yyt/klinechart'
  import demoData from './demo-data.json'

  const currentTheme = ref<'light' | 'dark'>('dark')

  const customData = ref<CustomDataSource>(demoData as CustomDataSource)

  const chartSettings: ChartSettings = {
    showGridLines: true,
    isAsiaMarket: true,
    showVolumePriceMarkers: false,
    leftAxisType: 'none',
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

**Import CSS in main.ts:**

```typescript
import '@363045841yyt/klinechart/style.css'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

**Slot Usage — Custom Tooltip:**

```html
<KlineChart>
  <template #kline-tooltip="{ hoverData, upColor, downColor }">
    <div class="custom-tooltip">
      <div class="custom-tooltip__title">
        <span>{{ hoverData.stockCode }}</span>
        <span>{{ formatTimestamp(hoverData.timestamp, { timeZone: 'Asia/Shanghai' }) }}</span>
      </div>
      <div class="custom-tooltip__price"
           :style="{ color: hoverData.close >= hoverData.open ? upColor : downColor }">
        {{ hoverData.close.toFixed(2) }}
      </div>
      <div class="custom-tooltip__detail">
        O: {{ hoverData.open.toFixed(2) }}<br> H: {{ hoverData.high.toFixed(2) }}<br>
        L: {{ hoverData.low.toFixed(2) }}<br> C: {{ hoverData.close.toFixed(2) }}
      </div>
    </div>
  </template>
</KlineChart>
```

**Slot Usage — Custom Main-Pane Legend:**

Providing `#legend` fully replaces the default Canvas legend. The slot scope is the full `LegendTemplateContext` (OHLC, timeshare, main indicators, comparisons, layout, colors).

```vue
<template>
  <KlineChart>
    <template #legend="{ ohlc, indicators, comparisons, colors }">
      <div class="my-legend" v-if="ohlc">
        <span :style="{ color: ohlc.color }">
          O {{ ohlc.open.toFixed(2) }}
          H {{ ohlc.high.toFixed(2) }}
          L {{ ohlc.low.toFixed(2) }}
          C {{ ohlc.close.toFixed(2) }}
        </span>
        <span v-for="ind in indicators" :key="ind.name" class="my-legend__ind">
          {{ ind.name }}
          <template v-if="ind.values">
            <span
              v-for="v in ind.values"
              :key="v.label"
              :style="{ color: v.color }"
            >
              {{ v.label }} {{ v.value.toFixed(3) }}
            </span>
          </template>
        </span>
        <span v-for="c in comparisons" :key="c.symbol" :style="{ color: c.percentColor }">
          {{ c.symbol }} {{ c.percent > 0 ? '+' : '' }}{{ c.percent.toFixed(2) }}%
        </span>
      </div>
    </template>
  </KlineChart>
</template>
```
