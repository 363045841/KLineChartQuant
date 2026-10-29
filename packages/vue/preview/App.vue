<template>
  <div class="app-container" :data-theme="currentTheme">
    <DebugControls
      @open-modal="showModal = true"
      @toggle-embed-size="toggleEmbedSize"
    />

    <!-- 嵌入场景：模拟组件库在父容器中的使用 -->
    <div
      ref="embedContainerRef"
      class="embed-container"
      :class="{ 'is-fullscreen': isFullscreen }"
      :style="{ width: embedWidth, height: embedHeight }"
    >
      <AgentWorkbenchShell
        :bridge="agentBridge"
        :panel-width-storage="webPanelWidthStorage"
        :panel-side-storage="webPanelSideStorage"
      >
        <template #chart>
          <KlineChart
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
          </KlineChart>
        </template>
      </AgentWorkbenchShell>
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
              <KlineChart @theme-change="onThemeChange" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, provide, inject, onBeforeUnmount, type Ref, type InjectionKey } from 'vue'
  import DebugControls from './DebugControls.vue'
  import { useChartDocumentTitle } from './useChartDocumentTitle'
  import {
    AgentWorkbenchShell,
    createAgentPanelSideStorage,
    createAgentPanelWidthStorage,
    KlineChart,
  } from '../src/index'
  import { BrowserAgentBridge } from '../src/features/agent/browser-agent/bridge/impl/browser-agent-bridge'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { formatTimeInTimeZone } from '@363045841yyt/klinechart-core'
  import { normalizeSettings } from '@363045841yyt/klinechart-core/config'

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

  const chartRef = ref<InstanceType<typeof KlineChart> | null>(null)
  const agentBridge = new BrowserAgentBridge({
    getChartAgent: () => chartRef.value?.getController?.()?.agent,
  })
  onBeforeUnmount(() => agentBridge.close())
  const webPanelWidthStorage = createAgentPanelWidthStorage()
  const webPanelSideStorage = createAgentPanelSideStorage()
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
    agentBridge.bindChartAgent(controller.agent)
    currentTheme.value = controller.theme.peek()
    bindDocumentTitle(controller)
  }

  provideFullscreenTeleportTarget(embedContainerRef)

  const teleportTarget = computed<HTMLElement | string>(() => embedContainerRef.value ?? 'body')

</script>

<style>
  .app-container {
    width: 100%;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .embed-container {
    width: 95%;
    flex: 1;
    min-height: 0;
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
    width: 100vw !important;
    height: 100dvh !important;
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
