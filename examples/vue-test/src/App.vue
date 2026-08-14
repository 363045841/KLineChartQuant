<template>
  <div class="app-container" :data-theme="currentTheme">
    <KlineChart
      :settings="chartSettings"
      :custom-data="customData"
      @theme-change="(t: 'light' | 'dark') => (currentTheme = t)"
    >
      <template #kline-tooltip="{ hoverData, upColor, downColor }">
        <div class="custom-tooltip">
          <div class="custom-tooltip__title">
            <span>{{ hoverData.symbol }}</span>
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

      <template #legend="{ index, currentBar, timeshare, indicators, comparisons, colors }">
        <div class="my-legend">
          <!-- PR #98 为 KLineData[] 添加的自定义字段会展开通过 currentBar 暴露 -->
          <div v-if="currentBar" class="my-legend__row">
            <span :style="{ color: currentBar.color }">
              开盘 {{ currentBar.open.toFixed(2) }} 最高 {{ currentBar.high.toFixed(2) }} 最低
              {{ currentBar.low.toFixed(2) }} 收盘 {{ currentBar.close.toFixed(2) }}
            </span>
            <span v-if="currentBar.volumeText">Vol {{ currentBar.volumeText }}</span>
          </div>

          <div v-if="timeshare" class="my-legend__row">
            <span :style="{ color: timeshare.changeColor }">
              现价 {{ timeshare.price.toFixed(2) }} 涨幅 {{ timeshare.changePercent.toFixed(2) }}%
            </span>
          </div>

          <!-- 主图指标图例 -->
          <div v-for="indicator in indicators" :key="indicator.name" class="my-legend__row">
            <span>{{ indicator.name }}</span>
            <template v-for="value in indicator.values" :key="value.label">
              <span :style="{ color: value.color }">
                {{ value.label }} {{ value.value.toFixed(3) }}
              </span>
            </template>
          </div>

          <div
            v-for="comparison in comparisons"
            :key="comparison.symbol"
            class="my-legend__row"
            :style="{ color: comparison.percentColor }"
          >
            <span class="my-legend__dot" :style="{ backgroundColor: comparison.color }"></span>
            {{ comparison.symbol }}
            {{ comparison.percent > 0 ? '+' : '' }}{{ comparison.percent.toFixed(2) }}%
          </div>
        </div>
      </template>
    </KlineChart>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { type CustomDataSource, KlineChart } from '@363045841yyt/klinechart'
  import demoData from './demo-data.json'
  import { formatTimestamp } from '@363045841yyt/klinechart-core'
  import type { ChartSettings } from '@363045841yyt/klinechart-core'

  const currentTheme = ref<'light' | 'dark'>('dark')

  const customData = ref<CustomDataSource>(demoData as CustomDataSource)

  const chartSettings: ChartSettings = {
    showGridLines: true,
    isAsiaMarket: true,
    showVolumePriceMarkers: false,
    mainLeftAxisDisplaySetting: 'none',
    theme: 'dark',
    /* colorPresetSettings: {
      dark: {
        candleUpBody: '#e85d04', // 橙色阳线
        candleDownBody: '#1b4332', // 墨绿阴线
        crosshairLine: '#faa307', // 金色十字线
        gridMajor: '#3e2723', // 主网格线
      },
    }, */
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

  .custom-tooltip {
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(30, 30, 30, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 12px;
    line-height: 1.5;
    backdrop-filter: blur(6px);
    pointer-events: none;
  }

  .custom-tooltip__title {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .custom-tooltip__price {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .custom-tooltip__detail {
    opacity: 0.7;
  }

  .my-legend__row {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
    align-items: center;
  }

  .my-legend__dot {
    align-self: center;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    margin-right: -6px;
  }
</style>
