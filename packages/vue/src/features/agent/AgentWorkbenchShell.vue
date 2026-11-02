<!-- 承载图表插槽与 Agent 面板，统一管理面板开合、停靠侧、宽度和响应式布局。 -->
<template>
  <div
    ref="shell"
    class="agent-workbench-shell"
    :class="{
      'agent-workbench-shell--resizing': resizing,
      'agent-workbench-shell--resize-ready': panelResizeReady,
      'agent-workbench-shell--panel-open': panelOpen,
      'agent-workbench-shell--panel-left': panelSide === 'left',
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
      :placement="panelSide === 'right' ? 'left' : 'right'"
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
        <IconChevronRight v-if="panelSide === 'left'" aria-hidden="true" />
        <IconChevronLeft v-else aria-hidden="true" />
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
      <AgentWorkspace
        :bridge="bridge"
        :panel-side="panelSide"
        @close="panelOpen = false"
        @toggle-panel-side="togglePanelSide"
      />
    </aside>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import IconChevronLeft from '~icons/tabler/chevron-left'
  import IconChevronRight from '~icons/tabler/chevron-right'

  import BaseTooltip from '../../components/common/BaseTooltip.vue'
  import type { AgentBridgeClient } from './agent-contracts.js'
  import { getAgentCopy } from './agent-copy.js'
  import AgentWorkspace from './components/AgentWorkspace.vue'
  import type {
    AgentPanelSide,
    AgentPanelSideStorage,
    AgentPanelWidthStorage,
  } from './workspace/types.js'

  const MIN_PANEL_WIDTH = 360
  const MAX_PANEL_WIDTH = 640
  const DEFAULT_PANEL_WIDTH = 420

  const props = withDefaults(
    defineProps<{
      bridge: AgentBridgeClient
      panelWidthStorage?: AgentPanelWidthStorage
      panelSideStorage?: AgentPanelSideStorage
      initialPanelOpen?: boolean
    }>(),
    {
      initialPanelOpen: true,
      panelWidthStorage: undefined,
      panelSideStorage: undefined,
    },
  )

  const shell = ref<HTMLElement | null>(null)
  const panel = ref<HTMLElement | null>(null)
  const panelOpen = ref(props.initialPanelOpen)
  const panelSide = ref<AgentPanelSide>('right')
  const panelWidth = ref(DEFAULT_PANEL_WIDTH)
  const resizing = ref(false)
  const panelResizeReady = ref(false)
  const compact = ref(false)
  let shellObserver: ResizeObserver | undefined

  // 启动器文案暂只支持中文；统一国际化后改由宿主注入 locale。
  const text = getAgentCopy('zh-CN')

  // 只发布面板宽度，轨道宽度由 CSS 依开合状态与停靠侧派生，避免同一数值两处来源。
  const shellStyle = computed(() => ({ '--agent-panel-width': `${panelWidth.value}px` }))

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

  // 在左右停靠侧之间切换并立即保存偏好，存储失败不阻断布局交互。
  function togglePanelSide(): void {
    panelSide.value = panelSide.value === 'right' ? 'left' : 'right'
    try {
      props.panelSideStorage?.save(panelSide.value)
    } catch {
      return
    }
  }

  // 根据停靠侧，用指针到对应容器边缘的距离更新面板宽度。
  function updatePanelFromPointer(event: PointerEvent): void {
    const bounds = shell.value?.getBoundingClientRect()
    if (!bounds) return
    panelWidth.value = clampPanelWidth(
      panelSide.value === 'right' ? bounds.right - event.clientX : event.clientX - bounds.left,
    )
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

  // 右侧面板的拖拽命中区在左边缘，左侧面板在右边缘。
  function isPanelResizeTarget(clientX: number): boolean {
    const bounds = panel.value?.getBoundingClientRect()
    if (!bounds) return false
    return panelSide.value === 'right'
      ? clientX - bounds.left <= 8
      : bounds.right - clientX <= 8
  }

  // 仅在面板内侧边缘附近显示横向拖拽光标。
  function updateResizeCursor(event: PointerEvent): void {
    panelResizeReady.value = !compact.value && isPanelResizeTarget(event.clientX)
  }

  // 仅在非紧凑布局的面板内侧边缘响应指针事件并开始拖拽。
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

    let storedSide: AgentPanelSide | null | undefined
    try {
      storedSide = props.panelSideStorage?.load()
    } catch {
      storedSide = undefined
    }
    if (storedSide === 'left' || storedSide === 'right') panelSide.value = storedSide

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
    /* 顶栏控件尺寸与关闭态启动器宽度同源，两个 header 的行内控件因此等高。 */
    --workbench-header-control-size: 30px;
    /* 面板轨道宽度：开启时等于面板宽度，关闭时收成一列启动器；紧凑模式下面板改为覆盖层，面板打开时为 0。 */
    --agent-panel-track: var(--workbench-header-control-size);
    --agent-bg: var(--klc-color-ui-background);
    --agent-surface: var(--klc-color-ui-surface);
    --agent-text: var(--klc-color-ui-text);
    --agent-focus: var(--klc-color-ui-focus);
    --agent-header-inset: 8px;

    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    /* 两列网格：图表与面板轨道共享同一列宽，两列表头因此天然对齐。 */
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--agent-panel-track);
    grid-template-rows: minmax(0, 1fr);
    background: var(--agent-bg);
  }

  /* 面板展开时轨道就是面板宽度。 */
  .agent-workbench-shell--panel-open {
    --agent-panel-track: var(--agent-panel-width);
  }

  /* 面板停靠在左侧时交换两列顺序，图表仍占满剩余空间。 */
  .agent-workbench-shell--panel-left {
    grid-template-columns: var(--agent-panel-track) minmax(0, 1fr);
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

    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    position: relative;
    overflow: hidden;
    padding: 0;
    box-sizing: border-box;
    background: var(--agent-bg);
  }

  /* 面板停靠在左侧时图表移到右列，宽度仍由剩余轨道决定。 */
  .agent-workbench-shell--panel-left .chart-surface {
    grid-column: 2;
  }

  /* 面板占面板轨道；贴外壳边缘固定，轨道收缩时不会横向跳位，关闭态整体移出后由外壳裁切。 */
  .agent-panel {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    width: var(--agent-panel-width);
    min-height: 0;
    z-index: 3;
    overflow: hidden;
    background: var(--agent-bg);
    visibility: hidden;
    transform: translateX(100%);
    transition:
      transform 0.28s ease,
      visibility 0s linear 0.28s;
  }

  /* 左侧停靠时从左侧滑入，关闭态向左侧移出。 */
  .agent-workbench-shell--panel-left .agent-panel {
    grid-column: 1;
    justify-self: start;
    transform: translateX(-100%);
  }

  .agent-workbench-shell--panel-open .agent-panel {
    visibility: visible;
    /* 动画结束后退出 transform 合成层，避免文字持续使用纹理栅格化。 */
    transform: none;
    transition:
      transform 0.28s ease,
      visibility 0s;
  }

  /* 悬浮在面板内侧边缘时提示左右拖拽。 */
  .agent-workbench-shell--resize-ready .agent-panel {
    cursor: ew-resize;
  }

  /* 关闭态启动器占满面板轨道，宽度与 AgentHeader 的收起按钮一致。 */
  .agent-launcher {
    grid-column: 2;
    grid-row: 1;
    width: var(--workbench-header-control-size);
    z-index: 20;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--klc-color-ui-border);
    border-left: 0;
    box-sizing: border-box;
    color: var(--agent-text);
    background: var(--agent-surface);
    cursor: pointer;
  }

  /* 左侧停靠时启动器移到左列，边框方向随之翻转。 */
  .agent-workbench-shell--panel-left .agent-launcher {
    grid-column: 1;
    border-left: 1px solid var(--klc-color-ui-border);
    border-right: 0;
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
    cursor: ew-resize !important;
    user-select: none !important;
  }

  /* 紧凑模式下面板改为覆盖层，轨道收为 0，图表占满整行。 */
  .agent-workbench-shell--compact {
    --agent-panel-track: 0px;
  }

  /* 面板关闭时仍为启动器保留一列，否则它会溢出到图表右侧并遮挡价格轴。 */
  .agent-workbench-shell--compact:not(.agent-workbench-shell--panel-open) {
    --agent-panel-track: var(--workbench-header-control-size);
  }

  .agent-workbench-shell--compact .drawer-backdrop {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: block;
    border: 0;
    background: var(--klc-color-agent-backdrop);
  }

  /* 覆盖层跨满整行，宽度百分比按外壳宽度解析；贴边方向沿用各停靠侧的对齐。 */
  .agent-workbench-shell--compact .agent-panel {
    grid-column: 1 / -1;
    border-left: 1px solid var(--klc-color-ui-border);
    width: min(var(--agent-panel-width), calc(100% - 28px));
    min-width: min(360px, calc(100% - 28px));
    z-index: 31;
    box-shadow: -12px 0 32px var(--klc-color-agent-panel-shadow);
  }

  /* 紧凑布局下左侧抽屉的边框与投影同样镜像到右侧。 */
  .agent-workbench-shell--compact.agent-workbench-shell--panel-left .agent-panel {
    border-left: 0;
    border-right: 1px solid var(--klc-color-ui-border);
    box-shadow: 12px 0 32px var(--klc-color-agent-panel-shadow);
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
