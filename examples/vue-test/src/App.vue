<template>
  <div class="app-container" :data-theme="currentTheme">
    <div class="toolbar">
      <button :class="{ active: useCustomData }" @click="onToggleCustomData">
        {{ useCustomData ? 'Custom Data' : 'Fetcher' }}
      </button>
      <button @click="onToggleTheme">
        {{ currentTheme === 'light' ? 'Dark' : 'Light' }}
      </button>
    </div>

    <div
      ref="embedContainerRef"
      class="embed-container"
      :class="{ 'is-fullscreen': isFullscreen }"
    >
      <KLineChart
        ref="chartRef"
        :dataFetcher="dataFetcher"
        :left-axis-width="60"
        :custom-data="customData"
        :is-fullscreen="isFullscreen"
        @toggle-fullscreen="toggleFullscreen"
        @theme-change="onThemeChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { KLineChartVue as KLineChart } from '@363045841yyt/klinechart'
import { routerDataFetcher, type KLineData } from '@363045841yyt/klinechart-core/controllers'
import type { CustomDataSource } from '@363045841yyt/klinechart'

const DEMO_MAIN_DATA: KLineData[] = [
  { timestamp: 1748736000000, date: '2025-06-01', open: 30.00, high: 32.00, low: 30.00, close: 31.50, volume: 1500000 },
  { timestamp: 1748822400000, date: '2025-06-02', open: 31.50, high: 33.20, low: 31.20, close: 33.00, volume: 2100000 },
  { timestamp: 1748908800000, date: '2025-06-03', open: 33.00, high: 33.50, low: 31.80, close: 32.10, volume: 1800000 },
  { timestamp: 1748995200000, date: '2025-06-04', open: 32.10, high: 32.80, low: 31.00, close: 31.20, volume: 1200000 },
  { timestamp: 1749081600000, date: '2025-06-05', open: 31.20, high: 31.50, low: 29.80, close: 30.00, volume: 900000 },
  { timestamp: 1749168000000, date: '2025-06-06', open: 30.00, high: 31.00, low: 29.50, close: 30.80, volume: 1350000 },
  { timestamp: 1749254400000, date: '2025-06-07', open: 30.80, high: 32.40, low: 30.60, close: 32.20, volume: 1700000 },
  { timestamp: 1749340800000, date: '2025-06-08', open: 32.20, high: 34.00, low: 32.00, close: 33.80, volume: 2200000 },
  { timestamp: 1749427200000, date: '2025-06-09', open: 33.80, high: 35.50, low: 33.50, close: 35.00, volume: 2600000 },
  { timestamp: 1749513600000, date: '2025-06-10', open: 35.00, high: 35.20, low: 33.60, close: 33.80, volume: 1900000 },
  { timestamp: 1749600000000, date: '2025-06-11', open: 33.80, high: 34.50, low: 33.00, close: 34.20, volume: 1550000 },
  { timestamp: 1749686400000, date: '2025-06-12', open: 34.20, high: 36.00, low: 34.00, close: 35.60, volume: 2400000 },
  { timestamp: 1749772800000, date: '2025-06-13', open: 35.60, high: 36.50, low: 35.00, close: 36.20, volume: 2800000 },
  { timestamp: 1749859200000, date: '2025-06-14', open: 36.20, high: 36.80, low: 35.20, close: 35.50, volume: 2000000 },
  { timestamp: 1749945600000, date: '2025-06-15', open: 35.50, high: 36.00, low: 34.50, close: 35.80, volume: 1600000 },
]

const DEMO_COMP_A_DATA: KLineData[] = [
  { timestamp: 1748736000000, date: '2025-06-01', open: 28.00, high: 29.50, low: 27.80, close: 29.00, volume: 800000 },
  { timestamp: 1748822400000, date: '2025-06-02', open: 29.00, high: 29.20, low: 27.50, close: 27.80, volume: 950000 },
  { timestamp: 1748908800000, date: '2025-06-03', open: 27.80, high: 28.50, low: 26.80, close: 27.00, volume: 720000 },
  { timestamp: 1748995200000, date: '2025-06-04', open: 27.00, high: 27.20, low: 25.50, close: 25.80, volume: 1100000 },
  { timestamp: 1749081600000, date: '2025-06-05', open: 25.80, high: 26.50, low: 25.00, close: 25.20, volume: 680000 },
  { timestamp: 1749168000000, date: '2025-06-06', open: 25.20, high: 26.00, low: 24.80, close: 25.60, volume: 840000 },
  { timestamp: 1749254400000, date: '2025-06-07', open: 25.60, high: 26.80, low: 25.40, close: 26.50, volume: 920000 },
  { timestamp: 1749340800000, date: '2025-06-08', open: 26.50, high: 27.50, low: 26.20, close: 27.30, volume: 1050000 },
  { timestamp: 1749427200000, date: '2025-06-09', open: 27.30, high: 28.00, low: 26.80, close: 27.00, volume: 780000 },
  { timestamp: 1749513600000, date: '2025-06-10', open: 27.00, high: 27.20, low: 25.80, close: 26.10, volume: 890000 },
  { timestamp: 1749600000000, date: '2025-06-11', open: 26.10, high: 26.50, low: 25.00, close: 25.20, volume: 760000 },
  { timestamp: 1749686400000, date: '2025-06-12', open: 25.20, high: 25.80, low: 24.00, close: 24.50, volume: 1300000 },
  { timestamp: 1749772800000, date: '2025-06-13', open: 24.50, high: 25.60, low: 24.20, close: 25.40, volume: 960000 },
  { timestamp: 1749859200000, date: '2025-06-14', open: 25.40, high: 26.50, low: 25.00, close: 26.20, volume: 1120000 },
  { timestamp: 1749945600000, date: '2025-06-15', open: 26.20, high: 27.00, low: 25.80, close: 26.80, volume: 840000 },
]

const DEMO_COMP_B_DATA: KLineData[] = [
  { timestamp: 1748736000000, date: '2025-06-01', open: 35.00, high: 36.50, low: 34.80, close: 36.00, volume: 1800000 },
  { timestamp: 1748822400000, date: '2025-06-02', open: 36.00, high: 37.20, low: 35.50, close: 37.00, volume: 2200000 },
  { timestamp: 1748908800000, date: '2025-06-03', open: 37.00, high: 38.00, low: 36.20, close: 36.50, volume: 1950000 },
  { timestamp: 1748995200000, date: '2025-06-04', open: 36.50, high: 37.50, low: 35.80, close: 37.20, volume: 1650000 },
  { timestamp: 1749081600000, date: '2025-06-05', open: 37.20, high: 39.00, low: 37.00, close: 38.50, volume: 2500000 },
  { timestamp: 1749168000000, date: '2025-06-06', open: 38.50, high: 40.00, low: 38.20, close: 39.80, volume: 2800000 },
  { timestamp: 1749254400000, date: '2025-06-07', open: 39.80, high: 41.50, low: 39.50, close: 41.00, volume: 3100000 },
  { timestamp: 1749340800000, date: '2025-06-08', open: 41.00, high: 41.20, low: 39.00, close: 39.50, volume: 2400000 },
  { timestamp: 1749427200000, date: '2025-06-09', open: 39.50, high: 40.00, low: 38.00, close: 38.50, volume: 2100000 },
  { timestamp: 1749513600000, date: '2025-06-10', open: 38.50, high: 39.50, low: 37.50, close: 39.00, volume: 1750000 },
  { timestamp: 1749600000000, date: '2025-06-11', open: 39.00, high: 40.80, low: 38.50, close: 40.50, volume: 2300000 },
  { timestamp: 1749686400000, date: '2025-06-12', open: 40.50, high: 42.00, low: 40.00, close: 41.50, volume: 2900000 },
  { timestamp: 1749772800000, date: '2025-06-13', open: 41.50, high: 43.50, low: 41.00, close: 43.00, volume: 3400000 },
  { timestamp: 1749859200000, date: '2025-06-14', open: 43.00, high: 43.50, low: 41.50, close: 42.00, volume: 2600000 },
  { timestamp: 1749945600000, date: '2025-06-15', open: 42.00, high: 42.50, low: 40.50, close: 41.20, volume: 1900000 },
]

const dataFetcher = routerDataFetcher

const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)

const isFullscreen = ref(false)
const embedContainerRef = ref<HTMLElement | null>(null)
const currentTheme = ref<'light' | 'dark'>('light')

function onThemeChange(theme: 'light' | 'dark') {
  currentTheme.value = theme
}

function onToggleTheme() {
  const next = currentTheme.value === 'light' ? 'dark' : 'light'
  chartRef.value?.getController?.()?.setTheme(next)
}

async function toggleFullscreen() {
  if (!embedContainerRef.value) return
  try {
    if (!document.fullscreenElement) {
      await embedContainerRef.value.requestFullscreen()
      isFullscreen.value = true
    } else {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
  } catch (err) {
    console.error('Fullscreen error:', err)
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
}

const useCustomData = ref(false)
const customData = ref<CustomDataSource | null>(null)

function onToggleCustomData() {
  useCustomData.value = !useCustomData.value
  if (useCustomData.value) {
    customData.value = {
      symbol: 'CUSTOM.DEMO',
      period: 'daily',
      data: DEMO_MAIN_DATA,
      comparisons: {
        'COMP.A': DEMO_COMP_A_DATA,
        'COMP.B': DEMO_COMP_B_DATA,
      },
    }
  } else {
    customData.value = null
  }
}
</script>

<style>
body {
  margin: 0;
}

.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.toolbar button {
  padding: 4px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.2s, color 0.2s;
}

.toolbar button:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.toolbar button.active {
  background: #e6f4ff;
  border-color: #1890ff;
  color: #1890ff;
}

.embed-container {
  flex: 1;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  --kmap-chart-height: 100%;
  --kmap-chart-width: 100%;
}

.embed-container:fullscreen,
.embed-container.is-fullscreen {
  border: none;
  margin: 0;
  border-radius: 0;
  width: 100vw !important;
  height: 100vh !important;
  background: #fff;
}

.app-container[data-theme='dark'] {
  background: #000;
  color: #e5e7eb;
}

.app-container[data-theme='dark'] .toolbar {
  background: #1f2937;
  border-color: #374151;
}

.app-container[data-theme='dark'] .toolbar button {
  background: #374151;
  border-color: #4b5563;
  color: #d1d5db;
}

.app-container[data-theme='dark'] .toolbar button:hover {
  border-color: #60a5fa;
  color: #60a5fa;
}

.app-container[data-theme='dark'] .toolbar button.active {
  background: #1e3a5f;
  border-color: #60a5fa;
  color: #60a5fa;
}

.app-container[data-theme='dark'] .embed-container:fullscreen,
.app-container[data-theme='dark'] .embed-container.is-fullscreen {
  background: #000;
}
</style>
