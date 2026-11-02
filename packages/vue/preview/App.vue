<template>
  <div class="app-container" :data-theme="currentTheme">
    <!-- 嵌入场景：模拟组件库在父容器中的使用 -->
    <div class="embed-container" :class="{ 'is-fullscreen': isFullscreen }">
          <KlineWorkbench
            ref="chartRef"
            :left-axis-width="60"
            @update:is-fullscreen="isFullscreen = $event"
            @theme-change="onThemeChange"
            @controller-ready="onControllerReady"
          >
            <!-- 自定义 Tooltip -->
            <!-- <template #kline-tooltip="{ hoverData, upColor, downColor }">
          <div class="custom-tooltip">
            <div class="custom-tooltip__title">
              <span>{{ hoverData.symbol }}</span>
              <span>{{ formatTimeInTimeZone(hoverData.timestamp, { timeZone: 'Asia/Shanghai', showTime: false }) }}</span>
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
        </template> -->
          </KlineWorkbench>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useChartDocumentTitle } from './useChartDocumentTitle'
  import { KlineWorkbench } from '../src/index'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { formatTimeInTimeZone } from '@363045841yyt/klinechart-core'
  import { normalizeSettings } from '@363045841yyt/klinechart-core/config'

  const chartRef = ref<InstanceType<typeof KlineWorkbench> | null>(null)

  const isFullscreen = ref(false)

  // 初始主题取默认值，控制器就绪后跟随活动布局的有效主题。
  const themePreference = normalizeSettings().theme
  const currentTheme = ref<'light' | 'dark'>(
    themePreference === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : (themePreference as 'light' | 'dark'),
  )

  /** 主品种 → 浏览器 Tab 标题同步器，控制器就绪时绑定。 */
  const { bind: bindDocumentTitle } = useChartDocumentTitle()

  function onThemeChange(theme: 'light' | 'dark') {
    currentTheme.value = theme
  }

  /** 控制器就绪后用内部解析出的有效主题初始化外壳主题。 */
  function onControllerReady(controller: ChartController) {
    currentTheme.value = controller.theme.peek()
    bindDocumentTitle(controller)
  }

</script>

<style>
  .app-container {
    width: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  /* 作为 column flex 的拉伸项占满剩余高度；宽度按块级默认铺满，不再依赖百分比声明。 */
  .embed-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    --kmap-chart-height: 100%;
    --kmap-chart-width: 100%;
  }

  .embed-container:fullscreen,
  .embed-container.is-fullscreen {
    border: none;
    margin: 0;
    width: 100vw !important;
    height: 100dvh !important;
    background: #fff;
  }

  /* ── 深色模式 ── */
  .app-container[data-theme='dark'] {
    background: #000000;
    color: #e5e7eb;
  }

  .app-container[data-theme='dark'] .embed-container {
    border-color: #374151;
  }

  .app-container[data-theme='dark'] .embed-container:fullscreen,
  .app-container[data-theme='dark'] .embed-container.is-fullscreen {
    background: #000000;
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

  .my-legend {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: min(760px, calc(100vw - 96px));
    font-variant-numeric: tabular-nums;
    line-height: 18px;
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

  .my-legend__signal {
    color: #f59e0b;
    font-weight: 600;
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
</style>
