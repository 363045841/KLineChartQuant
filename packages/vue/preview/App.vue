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
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </button>
        <button
          :class="{ 'is-active': useDepthDemo }"
          @click="onToggleDepthDemo"
          title="Toggle Depth Pipeline (Binance SSE → HeatmapController)"
        >
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
            <rect x="2" y="10" width="4" height="10" rx="1" />
            <rect x="10" y="4" width="4" height="16" rx="1" />
            <rect x="18" y="7" width="4" height="13" rx="1" />
          </svg>
        </button>
      </div>
      <div class="debug-right">
        <span v-if="useDepthDemo" class="depth-status-badge" :class="depthStatusClass">{{
          depthStatusText
        }}</span>
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
        :left-axis-width="60"
        :custom-data="customData"
        :theme="currentTheme"
        @update:is-fullscreen="isFullscreen = $event"
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
              <KLineChart @theme-change="onThemeChange" />
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
  import {
    type KLineData,
    type CustomDataSource,
    BinanceSSESource,
    DepthConnector,
    createHeatmapController,
  } from '@363045841yyt/klinechart-core/controllers'
  import { executeTool } from '@363045841yyt/klinechart-ai-runtime'

  /** 硬编码演示数据：主品种 CUSTOM.DEMO（15 根日 K） */
  const DEMO_MAIN_DATA: KLineData[] = [
    {
      timestamp: 1748736000000,
      date: '2025-06-01',
      open: 30.0,
      high: 32.0,
      low: 30.0,
      close: 31.5,
      volume: 1500000,
    },
    {
      timestamp: 1748822400000,
      date: '2025-06-02',
      open: 31.5,
      high: 33.2,
      low: 31.2,
      close: 33.0,
      volume: 2100000,
    },
    {
      timestamp: 1748908800000,
      date: '2025-06-03',
      open: 33.0,
      high: 33.5,
      low: 31.8,
      close: 32.1,
      volume: 1800000,
    },
    {
      timestamp: 1748995200000,
      date: '2025-06-04',
      open: 32.1,
      high: 32.8,
      low: 31.0,
      close: 31.2,
      volume: 1200000,
    },
    {
      timestamp: 1749081600000,
      date: '2025-06-05',
      open: 31.2,
      high: 31.5,
      low: 29.8,
      close: 30.0,
      volume: 900000,
    },
    {
      timestamp: 1749168000000,
      date: '2025-06-06',
      open: 30.0,
      high: 31.0,
      low: 29.5,
      close: 30.8,
      volume: 1350000,
    },
    {
      timestamp: 1749254400000,
      date: '2025-06-07',
      open: 30.8,
      high: 32.4,
      low: 30.6,
      close: 32.2,
      volume: 1700000,
    },
    {
      timestamp: 1749340800000,
      date: '2025-06-08',
      open: 32.2,
      high: 34.0,
      low: 32.0,
      close: 33.8,
      volume: 2200000,
    },
    {
      timestamp: 1749427200000,
      date: '2025-06-09',
      open: 33.8,
      high: 35.5,
      low: 33.5,
      close: 35.0,
      volume: 2600000,
    },
    {
      timestamp: 1749513600000,
      date: '2025-06-10',
      open: 35.0,
      high: 35.2,
      low: 33.6,
      close: 33.8,
      volume: 1900000,
    },
    {
      timestamp: 1749600000000,
      date: '2025-06-11',
      open: 33.8,
      high: 34.5,
      low: 33.0,
      close: 34.2,
      volume: 1550000,
    },
    {
      timestamp: 1749686400000,
      date: '2025-06-12',
      open: 34.2,
      high: 36.0,
      low: 34.0,
      close: 35.6,
      volume: 2400000,
    },
    {
      timestamp: 1749772800000,
      date: '2025-06-13',
      open: 35.6,
      high: 36.5,
      low: 35.0,
      close: 36.2,
      volume: 2800000,
    },
    {
      timestamp: 1749859200000,
      date: '2025-06-14',
      open: 36.2,
      high: 36.8,
      low: 35.2,
      close: 35.5,
      volume: 2000000,
    },
    {
      timestamp: 1749945600000,
      date: '2025-06-15',
      open: 35.5,
      high: 36.0,
      low: 34.5,
      close: 35.8,
      volume: 1600000,
    },
  ]

  /** 硬编码演示数据：对比商品 COMP.A（15 根日 K，偏弱走势） */
  const DEMO_COMP_A_DATA: KLineData[] = [
    {
      timestamp: 1748736000000,
      date: '2025-06-01',
      open: 28.0,
      high: 29.5,
      low: 27.8,
      close: 29.0,
      volume: 800000,
    },
    {
      timestamp: 1748822400000,
      date: '2025-06-02',
      open: 29.0,
      high: 29.2,
      low: 27.5,
      close: 27.8,
      volume: 950000,
    },
    {
      timestamp: 1748908800000,
      date: '2025-06-03',
      open: 27.8,
      high: 28.5,
      low: 26.8,
      close: 27.0,
      volume: 720000,
    },
    {
      timestamp: 1748995200000,
      date: '2025-06-04',
      open: 27.0,
      high: 27.2,
      low: 25.5,
      close: 25.8,
      volume: 1100000,
    },
    {
      timestamp: 1749081600000,
      date: '2025-06-05',
      open: 25.8,
      high: 26.5,
      low: 25.0,
      close: 25.2,
      volume: 680000,
    },
    {
      timestamp: 1749168000000,
      date: '2025-06-06',
      open: 25.2,
      high: 26.0,
      low: 24.8,
      close: 25.6,
      volume: 840000,
    },
    {
      timestamp: 1749254400000,
      date: '2025-06-07',
      open: 25.6,
      high: 26.8,
      low: 25.4,
      close: 26.5,
      volume: 920000,
    },
    {
      timestamp: 1749340800000,
      date: '2025-06-08',
      open: 26.5,
      high: 27.5,
      low: 26.2,
      close: 27.3,
      volume: 1050000,
    },
    {
      timestamp: 1749427200000,
      date: '2025-06-09',
      open: 27.3,
      high: 28.0,
      low: 26.8,
      close: 27.0,
      volume: 780000,
    },
    {
      timestamp: 1749513600000,
      date: '2025-06-10',
      open: 27.0,
      high: 27.2,
      low: 25.8,
      close: 26.1,
      volume: 890000,
    },
    {
      timestamp: 1749600000000,
      date: '2025-06-11',
      open: 26.1,
      high: 26.5,
      low: 25.0,
      close: 25.2,
      volume: 760000,
    },
    {
      timestamp: 1749686400000,
      date: '2025-06-12',
      open: 25.2,
      high: 25.8,
      low: 24.0,
      close: 24.5,
      volume: 1300000,
    },
    {
      timestamp: 1749772800000,
      date: '2025-06-13',
      open: 24.5,
      high: 25.6,
      low: 24.2,
      close: 25.4,
      volume: 960000,
    },
    {
      timestamp: 1749859200000,
      date: '2025-06-14',
      open: 25.4,
      high: 26.5,
      low: 25.0,
      close: 26.2,
      volume: 1120000,
    },
    {
      timestamp: 1749945600000,
      date: '2025-06-15',
      open: 26.2,
      high: 27.0,
      low: 25.8,
      close: 26.8,
      volume: 840000,
    },
  ]

  /** 硬编码演示数据：对比商品 COMP.B（15 根日 K，偏强走势） */
  const DEMO_COMP_B_DATA: KLineData[] = [
    {
      timestamp: 1748736000000,
      date: '2025-06-01',
      open: 35.0,
      high: 36.5,
      low: 34.8,
      close: 36.0,
      volume: 1800000,
    },
    {
      timestamp: 1748822400000,
      date: '2025-06-02',
      open: 36.0,
      high: 37.2,
      low: 35.5,
      close: 37.0,
      volume: 2200000,
    },
    {
      timestamp: 1748908800000,
      date: '2025-06-03',
      open: 37.0,
      high: 38.0,
      low: 36.2,
      close: 36.5,
      volume: 1950000,
    },
    {
      timestamp: 1748995200000,
      date: '2025-06-04',
      open: 36.5,
      high: 37.5,
      low: 35.8,
      close: 37.2,
      volume: 1650000,
    },
    {
      timestamp: 1749081600000,
      date: '2025-06-05',
      open: 37.2,
      high: 39.0,
      low: 37.0,
      close: 38.5,
      volume: 2500000,
    },
    {
      timestamp: 1749168000000,
      date: '2025-06-06',
      open: 38.5,
      high: 40.0,
      low: 38.2,
      close: 39.8,
      volume: 2800000,
    },
    {
      timestamp: 1749254400000,
      date: '2025-06-07',
      open: 39.8,
      high: 41.5,
      low: 39.5,
      close: 41.0,
      volume: 3100000,
    },
    {
      timestamp: 1749340800000,
      date: '2025-06-08',
      open: 41.0,
      high: 41.2,
      low: 39.0,
      close: 39.5,
      volume: 2400000,
    },
    {
      timestamp: 1749427200000,
      date: '2025-06-09',
      open: 39.5,
      high: 40.0,
      low: 38.0,
      close: 38.5,
      volume: 2100000,
    },
    {
      timestamp: 1749513600000,
      date: '2025-06-10',
      open: 38.5,
      high: 39.5,
      low: 37.5,
      close: 39.0,
      volume: 1750000,
    },
    {
      timestamp: 1749600000000,
      date: '2025-06-11',
      open: 39.0,
      high: 40.8,
      low: 38.5,
      close: 40.5,
      volume: 2300000,
    },
    {
      timestamp: 1749686400000,
      date: '2025-06-12',
      open: 40.5,
      high: 42.0,
      low: 40.0,
      close: 41.5,
      volume: 2900000,
    },
    {
      timestamp: 1749772800000,
      date: '2025-06-13',
      open: 41.5,
      high: 43.5,
      low: 41.0,
      close: 43.0,
      volume: 3400000,
    },
    {
      timestamp: 1749859200000,
      date: '2025-06-14',
      open: 43.0,
      high: 43.5,
      low: 41.5,
      close: 42.0,
      volume: 2600000,
    },
    {
      timestamp: 1749945600000,
      date: '2025-06-15',
      open: 42.0,
      high: 42.5,
      low: 40.5,
      close: 41.2,
      volume: 1900000,
    },
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
    { w: '100%', h: '100%' },
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

  // ── 自定义数据源 Demo ──
  const useCustomData = ref(false)
  const customData = ref<CustomDataSource>()

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
      customData.value = undefined
    }
  }

  // ── 深度行情 Pipeline Demo ──
  const useDepthDemo = ref(false)
  const depthStatusText = ref('')
  const depthStatusClass = ref('')
  let depthConnector: DepthConnector | null = null
  let depthController: ReturnType<typeof createHeatmapController> | null = null
  let depthUnsubState: (() => void) | null = null

  function onToggleDepthDemo() {
    useDepthDemo.value = !useDepthDemo.value
    if (useDepthDemo.value) {
      const source = new BinanceSSESource('btcusdt')
      depthController = createHeatmapController({ tickSize: 0.01 })
      depthConnector = new DepthConnector(source)
      depthConnector.addController(depthController)
      depthUnsubState = depthController.state.on((s) => {
        if (s.latestSnapshot) {
          depthStatusText.value = `depth: ${s.snapshotCount} snapshots · ${s.deltaCount} deltas`
          depthStatusClass.value = 'depth-connected'
        } else {
          depthStatusText.value = 'depth: awaiting data...'
          depthStatusClass.value = 'depth-awaiting'
        }
      })
      depthConnector.start()
    } else {
      depthUnsubState?.()
      depthUnsubState = null
      depthConnector?.destroy()
      depthConnector = null
      depthController = null
      depthStatusText.value = ''
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

  .depth-status-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-family: monospace;
    white-space: nowrap;
    border: 1px solid;
  }

  .depth-status-badge.depth-awaiting {
    background: #fffbe6;
    border-color: #ffe58f;
    color: #ad8b00;
  }

  .depth-status-badge.depth-connected {
    background: #f6ffed;
    border-color: #b7eb8f;
    color: #389e0d;
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

  .debug-controls button.is-active {
    background: #e6f7ff;
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

  .app-container[data-theme='dark'] .debug-controls button.is-active {
    background: #1e3a5f;
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

  .app-container[data-theme='dark'] .depth-status-badge.depth-awaiting {
    background: #2b1d0b;
    border-color: #5c3a0e;
    color: #e8b839;
  }

  .app-container[data-theme='dark'] .depth-status-badge.depth-connected {
    background: #0b2b1a;
    border-color: #0e5c2e;
    color: #52c41a;
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
