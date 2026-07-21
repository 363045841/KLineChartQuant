{{include:_header.md}}

{{include:_badges.md}}

{{include:_hero.md}}

{{include:_features.md}}

## 🚀 Quick Start

{{include:_prerequisites.md}}

{{include:_usage-vue.md}}

## 🎨 Custom Tooltip

`KlineChart` exposes `#kline-tooltip` and `#marker-tooltip` slots for custom tooltip rendering. When a slot is provided, the default tooltip content is replaced entirely, giving you full control over display content and styling.

Positioning and drag stay owned by the chart: with `tooltipPosition === 'adaptive'` (default), a custom `#kline-tooltip` is also draggable; double-click resets.

### `#kline-tooltip`

| Slot Prop              | Type                                          | Description                                      |
| ---------------------- | --------------------------------------------- | ------------------------------------------------ |
| `hoverData`            | `KLineData`                                   | Hovered K-line data (guaranteed non-null)        |
| `hoveredIndex`         | `number \| null`                              | Data index                                       |
| `data`                 | `ReadonlyArray<KLineData>`                    | Full data array                                  |
| `upColor` / `downColor`| `string`                                      | Current theme's up/down colors                   |

```vue
<KlineChart v-model:theme="currentTheme">
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
        O: {{ hoverData.open.toFixed(2) }} H: {{ hoverData.high.toFixed(2) }}<br>
        L: {{ hoverData.low.toFixed(2) }} C: {{ hoverData.close.toFixed(2) }}
      </div>
    </div>
  </template>
</KlineChart>

<script setup lang="ts">
  import { formatTimestamp } from '@363045841yyt/klinechart-core'
</script>

<style scoped>
  .custom-tooltip {
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(30, 30, 30, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 12px;
    pointer-events: none;
    backdrop-filter: blur(6px);
  }
  .custom-tooltip__title {
    display: flex; justify-content: space-between; gap: 12px;
    font-weight: 600; margin-bottom: 4px;
  }
  .custom-tooltip__price {
    font-size: 18px; font-weight: 700; margin-bottom: 4px;
  }
  .custom-tooltip__detail { opacity: 0.7; }
</style>
```

### `#marker-tooltip`

| Slot Prop              | Type                                                            | Description                     |
| ---------------------- | --------------------------------------------------------------- | ------------------------------- |
| `marker`               | `MarkerEntity \| CustomMarkerEntity \| null`                    | Hovered marker data             |

{{include:_docs.md}}

{{include:_props.md}}

{{include:_roadmap.md}}

{{include:_whatsnew.md}}

{{include:_license.md}}
