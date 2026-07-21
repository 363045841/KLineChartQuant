{{include:_header.zh-CN.md}}

{{include:_badges.zh-CN.md}}

{{include:_hero.zh-CN.md}}

{{include:_features.zh-CN.md}}

## 🚀 快速开始

{{include:_prerequisites.zh-CN.md}}

{{include:_usage-vue.zh-CN.md}}

## 🎨 自定义 Tooltip

`KlineChart` 提供 `#kline-tooltip` 和 `#marker-tooltip` 插槽用于自定义 tooltip。当提供插槽时，默认 tooltip 内容完全被替换，你可以完全控制显示内容和样式。

定位与拖拽仍由组件接管：`tooltipPosition === 'adaptive'`（默认）时，自定义 `#kline-tooltip` 同样可拖拽；双击复位。

### `#kline-tooltip`

| 插槽属性              | 类型                                          | 说明                                      |
| ---------------------- | --------------------------------------------- | ------------------------------------------------ |
| `hoverData`            | `KLineData`                                   | 悬停 K 线数据（非 null）        |
| `hoveredIndex`         | `number \| null`                              | 数据索引                                       |
| `data`                 | `ReadonlyArray<KLineData>`                    | 完整数据数组                                  |
| `upColor` / `downColor`| `string`                                      | 当前主题的涨/跌颜色                   |

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

| 插槽属性              | 类型                                                            | 说明                     |
| ---------------------- | --------------------------------------------------------------- | ------------------------------- |
| `marker`               | `MarkerEntity \| CustomMarkerEntity \| null`                    | 悬停的标记数据             |

{{include:_docs.zh-CN.md}}

{{include:_props.zh-CN.md}}

{{include:_roadmap.zh-CN.md}}

{{include:_whatsnew.zh-CN.md}}

{{include:_license.zh-CN.md}}
