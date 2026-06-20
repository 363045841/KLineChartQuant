<template>
  <div class="app-container" :data-theme="currentTheme">
    <div class="debug-controls">
      <div class="debug-left">
        <button @click="showModal = true" title="打开 Modal">
          <svg
            class="debug-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        <button @click="toggleEmbedSize" title="切换嵌入容器尺寸">
          <svg
            class="debug-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
        <button
          :class="{ 'is-active': useCustomData }"
          @click="onToggleCustomData"
          :title="useCustomData ? '切换到 Fetcher 数据源' : '切换到自定义数据源'"
        >
          <svg class="debug-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </button>
      </div>
      <div class="debug-right">
        <span class="version-badge">{{ displayVersion }}</span>
        <a
          class="debug-link"
          href="https://github.com/363045841/KLineChartQuant"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
          aria-label="GitHub"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path
              d="M12 0C5.37 0 0 5.37 0 12a12 12 0 0 0 8.2 11.4c.6.1.82-.26.82-.58 0-.28-.01-1.03-.02-2.02-3.34.73-4.04-1.61-4.04-1.61-.55-1.38-1.33-1.75-1.33-1.75-1.1-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.08 1.84 2.83 1.3 3.52.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.53.12-3.18 0 0 1-.32 3.3 1.23A11.5 11.5 0 0 1 12 5.8c1.02 0 2.04.14 3 .42 2.3-1.56 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.62-2.8 5.64-5.48 5.95.43.37.82 1.1.82 2.22 0 1.6-.01 2.9-.01 3.3 0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z"
            />
          </svg>
        </a>
        <a
          class="debug-link"
          href="https://www.npmjs.com/package/@363045841yyt/klinechart?activeTab=readme"
          target="_blank"
          rel="noopener noreferrer"
          title="NPM"
          aria-label="NPM"
        >
          <svg viewBox="0 0 1024 1024" width="20" height="20" aria-hidden="true">
            <path
              d="M0 312.928v341.344h284.416v56.832H512v-56.832h512V312.928z m284.416 284.32H227.584v-170.656h-56.96v170.656H56.96v-227.456h227.456z m170.656 0v56.992h-113.696v-284.448h227.584v227.488h-113.888z m512.064 0H910.4v-170.656h-56.992v170.656h-56.96v-170.656h-56.736v170.656h-113.952v-227.456h341.408zM455.04 426.656H512v113.792h-56.96z"
              fill="#CB3837"
            />
          </svg>
        </a>
      </div>
    </div>

    <!-- 嵌入场景：模拟组件库在父容器中的使用 -->
    <div
      ref="embedContainerRef"
      class="embed-container"
      :class="{ 'is-fullscreen': isFullscreen }"
      :style="{ width: embedWidth, height: embedHeight }"
    >
      <KLineChart
        ref="chartRef"
        :mcp="mcpConfig"
        :dataFetcher="dataFetcher"
        :left-axis-width="60"
        :custom-data="customData"
        :is-fullscreen="isFullscreen"
        @toggle-fullscreen="toggleFullscreen"
        @theme-change="onThemeChange"
      />
    </div>

    <!-- Modal 场景 -->
    <Teleport :to="teleportTarget">
      <Transition name="modal">
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
          <div class="modal-container">
            <header class="modal-header">
              <span>K线图 Modal 测试</span>
              <button class="close-btn" @click="showModal = false">×</button>
            </header>
            <div class="modal-body">
              <KLineChart :dataFetcher="dataFetcher" @theme-change="onThemeChange" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, inject, type Ref, type InjectionKey } from 'vue'
import KLineChart from '../src/components/KLineChart.vue'
import { VERSION, CORE_VERSION } from '../src/version'
import { routerDataFetcher, type KLineData, type CustomDataSource } from '@363045841yyt/klinechart-core/controllers'
import { executeTool } from '@363045841yyt/klinechart-ai-runtime'

/** 硬编码演示数据：主品种 CUSTOM.DEMO（15 根日 K） */
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

/** 硬编码演示数据：对比商品 COMP.A（15 根日 K，偏弱走势） */
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

/** 硬编码演示数据：对比商品 COMP.B（15 根日 K，偏强走势） */
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

const FULLSCREEN_TARGET_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol(
  'fullscreen-teleport-target',
)

function provideFullscreenTeleportTarget(targetRef: Ref<HTMLElement | null>): void {
  provide(FULLSCREEN_TARGET_KEY, targetRef)
}

function useFullscreenTeleportTarget() {
  const targetRef = inject(FULLSCREEN_TARGET_KEY, null)
  return computed<HTMLElement | string>(() => {
    return targetRef?.value ?? 'body'
  })
}

const dataFetcher = routerDataFetcher

const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)
const mcpConfig = {
  wsUrl: 'ws://localhost:8081',
  autoReconnect: true,
  onToolCall: (call: { name: string; input: Record<string, unknown> }) => {
    const ctrl = chartRef.value?.getController?.()
    if (!ctrl) return { success: false, error: 'Controller not ready yet' }
    return executeTool(ctrl, call)
  },
}

const displayVersion = `Vue@${VERSION}-Core@${CORE_VERSION}`

const showModal = ref(false)

const sizeIndex = ref(0)
const sizes = [
  { w: '95%', h: '95%' },
  { w: '800px', h: '500px' },
  { w: '600px', h: '400px' },
  { w: '100%', h: '300px' },
]

const embedWidth = computed(() => sizes[sizeIndex.value]?.w ?? '100%')
const embedHeight = computed(() => sizes[sizeIndex.value]?.h ?? '100%')

function toggleEmbedSize() {
  sizeIndex.value = (sizeIndex.value + 1) % sizes.length
}

const isFullscreen = ref(false)
const embedContainerRef = ref<HTMLElement | null>(null)
const currentTheme = ref<'light' | 'dark'>('light')

function onThemeChange(theme: 'light' | 'dark') {
  currentTheme.value = theme
}

provideFullscreenTeleportTarget(embedContainerRef)

const teleportTarget = computed<HTMLElement | string>(() => embedContainerRef.value ?? 'body')

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

// ── 自定义数据源 Demo ──
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
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.debug-controls {
  position: relative;
  padding: 8px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  align-self: stretch;
}

.debug-left,
.debug-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.debug-link {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #333;
  text-decoration: none;
}

.debug-link:hover {
  color: #1890ff;
  border-color: #1890ff;
}

.version-badge {
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #666;
  font-size: 12px;
  font-family: monospace;
}

.debug-controls button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.debug-controls button:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.debug-icon {
  width: 20px;
  height: 20px;
}

@media (max-width: 640px) {
  .debug-controls {
    padding: 8px 12px;
  }

  .debug-left {
    gap: 4px;
  }

  .debug-center {
    display: none;
  }

  .debug-right {
    gap: 4px;
    margin-left: auto;
    order: 0;
    flex-shrink: 1;
    min-width: 0;
  }

  .version-badge {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
  }
}

.embed-container {
  flex: 1;
  min-height: 0;
  margin: 0 16px;
  border-radius: 8px;
  overflow: hidden;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-container {
  width: 90%;
  height: 80%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  border-radius: 4px;
  color: #666;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95) translateY(20px);
  opacity: 0;
}

/* ── 深色模式 ── */
.app-container[data-theme='dark'] {
  background: #000000;
  color: #e5e7eb;
}

.app-container[data-theme='dark'] .debug-controls {
  background: #1f2937;
  border-color: #374151;
}

.app-container[data-theme='dark'] .debug-link {
  background: #374151;
  border-color: #4b5563;
  color: #d1d5db;
}

.app-container[data-theme='dark'] .debug-link:hover {
  border-color: #60a5fa;
  color: #60a5fa;
}

.app-container[data-theme='dark'] .debug-controls button {
  background: #374151;
  border-color: #4b5563;
  color: #d1d5db;
}

.app-container[data-theme='dark'] .debug-controls button:hover {
  border-color: #60a5fa;
  color: #60a5fa;
}

.app-container[data-theme='dark'] .version-badge {
  color: #9ca3af;
}

.app-container[data-theme='dark'] .version-badge {
  background: #374151;
  border-color: #4b5563;
}

.app-container[data-theme='dark'] .embed-container {
  border-color: #374151;
}

.app-container[data-theme='dark'] .embed-container:fullscreen,
.app-container[data-theme='dark'] .embed-container.is-fullscreen {
  background: #000000;
}

.app-container[data-theme='dark'] .modal-container {
  background: #1f2937;
}

.app-container[data-theme='dark'] .modal-header {
  background: #374151;
  border-color: #4b5563;
  color: #e5e7eb;
}

.app-container[data-theme='dark'] .close-btn {
  color: #9ca3af;
}

.app-container[data-theme='dark'] .close-btn:hover {
  background: #4b5563;
  color: #f3f4f6;
}
</style>
