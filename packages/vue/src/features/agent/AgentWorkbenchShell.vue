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
      v-show="panelOpen"
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
    --agent-bg: var(--klc-color-agent-background);
    --agent-text: var(--klc-color-agent-text);
    --agent-focus: var(--klc-color-agent-focus);

    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    display: grid;
    grid-template-columns: minmax(520px, 1fr) var(--agent-panel-track);
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
    position: relative;
    overflow: hidden;
    padding: 0 16px;
    box-sizing: border-box;
    background: var(--agent-bg);
  }

  .agent-panel {
    min-width: 0;
    min-height: 0;
    position: relative;
    z-index: 3;
    overflow: hidden;
    border-left: 1px solid var(--klc-color-agent-border);
    background: var(--agent-bg);
  }

  .agent-workbench-shell--resize-ready .agent-panel {
    cursor: col-resize;
  }

  .agent-launcher {
    min-height: 34px;
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--klc-color-agent-launcher-border);
    border-radius: 5px;
    color: var(--agent-text);
    background: var(--klc-color-agent-launcher-background);
    box-shadow: 0 3px 12px var(--klc-color-agent-panel-shadow);
    font:
      600 12px/1 Inter,
      ui-sans-serif,
      system-ui,
      sans-serif;
    cursor: pointer;
  }

  .drawer-backdrop {
    display: none;
  }

  .agent-workbench-shell--resizing,
  .agent-workbench-shell--resizing * {
    cursor: col-resize !important;
    user-select: none !important;
  }

  .agent-workbench-shell--compact {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-workbench-shell--compact .chart-surface {
    grid-column: 1;
    grid-row: 1;
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
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 31;
    border-left: 1px solid var(--klc-color-agent-border);
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
