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

    <button
      v-if="!panelOpen"
      type="button"
      class="agent-launcher"
      data-testid="agent-panel-open"
      aria-label="Open Agent panel"
      title="Open Agent panel"
      @click="panelOpen = true"
    >
      <IconSparkles aria-hidden="true" />
      <span>Agent</span>
    </button>

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

  import AgentWorkspace from './components/AgentWorkspace.vue'

  import type { AgentBridgeClient } from './agent-contracts'
  import type { AgentPanelWidthStorage } from './workbench-shell'

  import IconSparkles from '~icons/tabler/sparkles'

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

  const shellStyle = computed(() => ({
    '--agent-panel-width': `${panelWidth.value}px`,
    '--agent-panel-track': panelOpen.value ? `${panelWidth.value}px` : '0px',
  }))

  function clampPanelWidth(width: number): number {
    return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
  }

  function persistPanelWidth(): void {
    try {
      props.panelWidthStorage?.save(panelWidth.value)
    } catch {
      return
    }
  }

  function updatePanelFromPointer(event: PointerEvent): void {
    const bounds = shell.value?.getBoundingClientRect()
    if (!bounds) return
    panelWidth.value = clampPanelWidth(bounds.right - event.clientX)
  }

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
    --agent-text: var(--klc-color-ui-text);
    --agent-focus: var(--klc-color-ui-focus);

    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--agent-bg);
  }

  .agent-workbench-shell :deep(button),
  .agent-workbench-shell :deep(input),
  .agent-workbench-shell :deep(select),
  .agent-workbench-shell :deep(textarea) {
    letter-spacing: 0;
  }

  .chart-surface {
    --kmap-chart-height: 100%;
    --kmap-chart-width: 100%;

    min-width: 0;
    min-height: 0;
    height: 100%;
    position: relative;
    overflow: hidden;
    padding: 0 16px;
    box-sizing: border-box;
    background: var(--agent-bg);
    margin-right: var(--agent-panel-track, 0px);
    transition: margin-right 0.28s ease;
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

  /* 右下角 1/4 圆启动器：圆心贴合屏幕右下角，弧面朝向左上。 */
  .agent-launcher {
    --agent-launcher-size: 56px;

    width: var(--agent-launcher-size);
    height: var(--agent-launcher-size);
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0;
    /* 1/4 圆质心位于圆心 4R/3π 处，相对方形盒中心偏移 (1/2 - 4/3π)R = 0.0756R；
       padding 取 2 倍偏移量，使图标对准 1/4 圆质心（水平垂直居中）。 */
    padding: calc(var(--agent-launcher-size) * 0.1512) 0 0 calc(var(--agent-launcher-size) * 0.1512);
    border: 1px solid var(--klc-color-ui-border);
    border-top-left-radius: 100% 100%;
    box-sizing: border-box;
    color: var(--agent-text);
    background: var(--klc-color-agent-launcher-background);
    box-shadow: 0 3px 12px var(--klc-color-agent-panel-shadow);
    font:
      600 12px/1 Inter,
      ui-sans-serif,
      system-ui,
      sans-serif;
    cursor: pointer;
    transition:
      width 0.2s ease,
      height 0.2s ease,
      padding 0.2s ease;
  }

  .agent-launcher:hover {
    --agent-launcher-size: 112px;
  }

  .agent-launcher svg {
    width: 16px;
    height: 16px;
  }

  /* 默认只显示图标，hover 时文字在图标下方平滑展开。 */
  .agent-launcher span {
    max-height: 0;
    margin-top: 0;
    opacity: 0;
    overflow: hidden;
    white-space: nowrap;
    /* 行高大于字号，避免 overflow 裁掉 g 等字母的下伸部。 */
    line-height: 1.3;
    transition:
      max-height 0.2s ease,
      margin-top 0.2s ease,
      opacity 0.2s ease;
  }

  .agent-launcher:hover span {
    max-height: 20px;
    margin-top: 6px;
    opacity: 1;
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
    transition: none;
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
