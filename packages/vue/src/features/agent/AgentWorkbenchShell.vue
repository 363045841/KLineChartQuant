<!-- 承载图表插槽与 Agent 面板，统一管理面板开合、宽度和响应式布局。 -->
<template>
  <div
    ref="shell"
    class="agent-workbench-shell"
    :class="{
      'agent-workbench-shell--resizing': resizing,
      'agent-workbench-shell--resize-ready': panelResizeReady,
      'agent-workbench-shell--panel-open': panelOpen,
      'agent-workbench-shell--compact': compact,
    }"
    :style="shellStyle"
  >
    <div class="chart-surface">
      <slot name="chart"></slot>
    </div>

    <BaseTooltip
      v-if="!panelOpen"
      :content="text.openPanel"
      placement="left"
      trigger-display="contents"
    >
      <button
        type="button"
        class="agent-launcher"
        data-testid="agent-panel-open"
        :aria-label="text.openPanel"
        aria-expanded="false"
        @click="panelOpen = true"
      >
        <IconChevronLeft aria-hidden="true" />
      </button>
    </BaseTooltip>

    <button
      v-if="panelOpen"
      type="button"
      class="drawer-backdrop"
      data-testid="agent-drawer-backdrop"
      aria-label="Close Agent panel"
      @click="panelOpen = false"
    ></button>

    <aside
      ref="panel"
      class="agent-panel"
      data-testid="agent-panel"
      @pointerdown="startResize"
      @pointermove="updateResizeCursor"
      @pointerleave="panelResizeReady = false"
    >
      <AgentWorkspace :bridge="bridge" @close="panelOpen = false" />
    </aside>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import IconChevronLeft from '~icons/tabler/chevron-left'

  import BaseTooltip from '../../components/common/BaseTooltip.vue'
  import type { AgentBridgeClient } from './agent-contracts.js'
  import { getAgentCopy } from './agent-copy.js'
  import AgentWorkspace from './components/AgentWorkspace.vue'
  import type { AgentPanelWidthStorage } from './workspace/types.js'

  const MIN_PANEL_WIDTH = 360
  const MAX_PANEL_WIDTH = 640
  const DEFAULT_PANEL_WIDTH = 420

  const props = withDefaults(
    defineProps<{
      bridge: AgentBridgeClient
      panelWidthStorage?: AgentPanelWidthStorage
      initialPanelOpen?: boolean
    }>(),
    { initialPanelOpen: true, panelWidthStorage: undefined },
  )

  const shell = ref<HTMLElement | null>(null)
  const panel = ref<HTMLElement | null>(null)
  const panelOpen = ref(props.initialPanelOpen)
  const panelWidth = ref(DEFAULT_PANEL_WIDTH)
  const resizing = ref(false)
  const panelResizeReady = ref(false)
  const compact = ref(false)
  let shellObserver: ResizeObserver | undefined

  // 启动器文案暂只支持中文；统一国际化后改由宿主注入 locale。
  const text = getAgentCopy('zh-CN')

  const shellStyle = computed(() => ({
    '--agent-panel-width': `${panelWidth.value}px`,
    '--agent-panel-track': panelOpen.value ? `${panelWidth.value}px` : '0px',
  }))

  // 将传入的面板宽度限制到允许范围，并返回整数像素值。
  function clampPanelWidth(width: number): number {
    return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
  }

  // 通过宿主注入的存储保存当前宽度，存储失败不阻断布局交互。
  function persistPanelWidth(): void {
    try {
      props.panelWidthStorage?.save(panelWidth.value)
    } catch {
      return
    }
  }

  // 根据指针事件的横坐标与容器右边界更新面板宽度。
  function updatePanelFromPointer(event: PointerEvent): void {
    const bounds = shell.value?.getBoundingClientRect()
    if (!bounds) return
    panelWidth.value = clampPanelWidth(bounds.right - event.clientX)
  }

  // 结束拖拽，移除文档级监听并保存最终宽度。
  function stopResize(): void {
    if (!resizing.value) return
    resizing.value = false
    document.removeEventListener('pointermove', updatePanelFromPointer)
    document.removeEventListener('pointerup', stopResize)
    document.removeEventListener('pointercancel', stopResize)
    persistPanelWidth()
  }

  // 判断指针是否位于面板左侧的拖拽命中区。
  function isPanelResizeTarget(clientX: number): boolean {
    const bounds = panel.value?.getBoundingClientRect()
    return Boolean(bounds && clientX - bounds.left <= 8)
  }

  // 仅在左侧边框附近显示横向拖拽光标。
  function updateResizeCursor(event: PointerEvent): void {
    panelResizeReady.value = !compact.value && isPanelResizeTarget(event.clientX)
  }

  // 仅在非紧凑布局的面板左边缘响应指针事件并开始拖拽。
  function startResize(event: PointerEvent): void {
    if (compact.value || !isPanelResizeTarget(event.clientX)) return
    event.preventDefault()
    resizing.value = true
    document.addEventListener('pointermove', updatePanelFromPointer)
    document.addEventListener('pointerup', stopResize)
    document.addEventListener('pointercancel', stopResize)
  }

  onMounted(() => {
    let storedWidth: number | null | undefined
    try {
      storedWidth = props.panelWidthStorage?.load()
    } catch {
      storedWidth = undefined
    }
    if (typeof storedWidth === 'number' && Number.isFinite(storedWidth)) {
      panelWidth.value = clampPanelWidth(storedWidth)
    }
    if (shell.value) {
      compact.value = shell.value.getBoundingClientRect().width < 880
      shellObserver = new ResizeObserver(([entry]) => {
        if (entry) compact.value = entry.contentRect.width < 880
      })
      shellObserver.observe(shell.value)
    }
  })

  onBeforeUnmount(() => {
    shellObserver?.disconnect()
    stopResize()
  })
</script>

<style scoped>
  .agent-workbench-shell {
    --agent-bg: var(--klc-color-ui-background);
    --agent-surface: var(--klc-color-ui-surface);
    --agent-text: var(--klc-color-ui-text);
    --agent-focus: var(--klc-color-ui-focus);
    --agent-header-inset: 12px;
    --agent-header-button-size: 30px;
    --chart-surface-padding: 16px;
    --chart-surface-end-padding: calc(var(--agent-header-inset) + var(--agent-header-button-size));

    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--agent-bg);
  }

  .agent-workbench-shell--panel-open {
    --chart-surface-end-padding: var(--chart-surface-padding);
  }

  .agent-workbench-shell :deep(button),
  .agent-workbench-shell :deep(input),
  .agent-workbench-shell :deep(select),
  .agent-workbench-shell :deep(textarea) {
    letter-spacing: 0;
  }

  /* 轨道宽度瞬间到位，只触发一次图表 resize；面板位移交给 compositor 的 transform，避免逐帧重布局。 */
  .chart-surface {
    --kmap-chart-height: 100%;
    --kmap-chart-width: 100%;

    min-width: 0;
    min-height: 0;
    height: 100%;
    position: relative;
    overflow: hidden;
    /* 收起时为启动器留出独立空间，不遮挡 chart 插槽中的自选股或工具栏。 */
    padding: 0 var(--chart-surface-end-padding) 0 var(--chart-surface-padding);
    box-sizing: border-box;
    background: var(--agent-bg);
    margin-right: var(--agent-panel-track, 0px);
  }

  .agent-panel {
    width: var(--agent-panel-width);
    min-height: 0;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    overflow: hidden;
    border-left: 1px solid var(--klc-color-ui-border);
    background: var(--agent-bg);
    visibility: hidden;
    transform: translateX(100%);
    will-change: transform;
    transition:
      transform 0.28s ease,
      visibility 0s linear 0.28s;
  }

  .agent-workbench-shell--panel-open .agent-panel {
    visibility: visible;
    transform: translateX(0);
    transition:
      transform 0.28s ease,
      visibility 0s;
  }

  .agent-workbench-shell--resize-ready .agent-panel {
    cursor: col-resize;
  }

  /* 宽度与 AgentHeader 的收起按钮一致；高度撑满 chart-surface，右侧贴屏幕边缘。 */
  .agent-launcher {
    width: var(--agent-header-button-size);
    height: auto;
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    z-index: 20;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--klc-color-ui-border);
    box-sizing: border-box;
    color: var(--agent-text);
    background: var(--agent-surface);
    cursor: pointer;
  }

  .agent-launcher:hover,
  .agent-launcher:focus-visible {
    background: var(--klc-color-ui-hover);
  }

  .agent-launcher:focus-visible {
    outline: 2px solid var(--agent-focus);
    outline-offset: 2px;
  }

  .agent-launcher svg {
    width: 16px;
    height: 16px;
  }

  .drawer-backdrop {
    display: none;
  }

  .agent-workbench-shell--resizing,
  .agent-workbench-shell--resizing * {
    cursor: col-resize !important;
    user-select: none !important;
  }

  .agent-workbench-shell--compact .chart-surface {
    margin-right: 0;
  }

  .agent-workbench-shell--compact .drawer-backdrop {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: block;
    border: 0;
    background: var(--klc-color-agent-backdrop);
  }

  .agent-workbench-shell--compact .agent-panel {
    width: min(var(--agent-panel-width), calc(100% - 28px));
    min-width: min(360px, calc(100% - 28px));
    z-index: 31;
    box-shadow: -12px 0 32px var(--klc-color-agent-panel-shadow);
  }

  @media (prefers-reduced-motion: reduce) {
    .agent-workbench-shell,
    .agent-workbench-shell *,
    .agent-workbench-shell *::before,
    .agent-workbench-shell *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>
