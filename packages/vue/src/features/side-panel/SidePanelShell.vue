<!-- 通用侧边面板：图表 + 互斥面板区 + 常驻侧边菜单栏；壳层不认识任何具体功能。 -->
<template>
  <div
    ref="shell"
    class="side-panel-shell"
    :class="{
      'side-panel-shell--open': activePanel !== null,
      'side-panel-shell--left': side === 'left',
      'side-panel-shell--compact': compact,
      'side-panel-shell--resizing': resizing,
      'side-panel-shell--resize-ready': resizeReady,
    }"
    :style="shellStyle"
  >
    <div class="side-panel-shell__chart">
      <slot name="chart"></slot>
    </div>

    <button
      v-if="compact && activePanel"
      type="button"
      class="side-panel-shell__backdrop"
      aria-label="关闭侧边面板"
      @click="closePanel"
    ></button>

    <aside
      ref="panel"
      class="side-panel-shell__panel"
      :aria-label="activeLabel"
      @pointerdown="startResize"
      @pointermove="updateResizeCursor"
      @pointerleave="resizeReady = false"
    >
      <div
        v-for="item in mountedPanels"
        v-show="item.id === activePanel"
        :key="item.id"
        class="side-panel-shell__panel-body"
      >
        <slot
          :name="`panel-${item.id}`"
          :side="side"
          :close="closePanel"
          :toggle-side="toggleSide"
        />
      </div>
    </aside>

    <nav
      class="side-panel-shell__rail"
      aria-label="侧边菜单"
      @pointerover="onRailPointerOver"
      @pointerleave="hideRailHighlight"
      @focusin="onRailFocusIn"
      @focusout="hideRailHighlight"
    >
      <SlidingHighlight ref="railHighlight" class="side-panel-shell__rail-highlight" />
      <BaseTooltip
        v-for="item in panels"
        :key="item.id"
        :content="item.label"
        :placement="side === 'right' ? 'left' : 'right'"
        trigger-display="contents"
      >
        <button
          type="button"
          class="side-panel-shell__rail-button klc-motion-icon-feedback"
          :class="{ 'is-active': item.id === activePanel }"
          :aria-label="item.label"
          :aria-pressed="item.id === activePanel"
          @click="togglePanel(item.id)"
        >
          <component :is="item.icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </nav>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import BaseTooltip from '../../components/common/BaseTooltip.vue'
  import SlidingHighlight from '../../components/common/SlidingHighlight.vue'
  import { useSlidingHighlight } from '../../composables/ui/useSlidingHighlight.js'
  import type {
    SidePanelDefinition,
    SidePanelSide,
    SidePanelSideStorage,
    SidePanelWidthStorage,
  } from './types.js'

  const MIN_PANEL_WIDTH = 360
  const MAX_PANEL_WIDTH = 640
  const DEFAULT_PANEL_WIDTH = 420
  /** 窄屏时面板改为覆盖层，图表至少保留这么多宽度，不再被挤压。 */
  const MIN_CHART_WIDTH = 560
  /** 侧边菜单栏宽度；与 CSS 的 `--side-panel-rail-width` 对应。 */
  const RAIL_WIDTH = 40
  /** 面板内侧边缘的拖拽命中区宽度。 */
  const RESIZE_HIT_PX = 8

  const props = withDefaults(
    defineProps<{
      /** 侧边菜单栏条目；数组顺序即菜单顺序。 */
      panels: ReadonlyArray<SidePanelDefinition>
      /** 首次挂载时展开的面板；不在 panels 中则忽略。 */
      initialPanel?: string | null
      /** 面板宽度持久化端口。 */
      widthStorage?: SidePanelWidthStorage
      /** 面板停靠侧持久化端口。 */
      sideStorage?: SidePanelSideStorage
    }>(),
    { initialPanel: null, widthStorage: undefined, sideStorage: undefined },
  )

  const shell = ref<HTMLElement | null>(null)
  const panel = ref<HTMLElement | null>(null)
  const railHighlight = ref<InstanceType<typeof SlidingHighlight> | null>(null)
  const activePanel = ref<string | null>(
    props.initialPanel && props.panels.some((item) => item.id === props.initialPanel)
      ? props.initialPanel
      : null,
  )
  // 面板内容首次展开才挂载；之后只切换可见性，草稿与滚动位置不丢。
  const mountedPanels = shallowRef<ReadonlyArray<SidePanelDefinition>>(
    props.panels.filter((item) => item.id === activePanel.value),
  )
  const side = ref<SidePanelSide>('right')
  const width = ref(DEFAULT_PANEL_WIDTH)
  const resizing = ref(false)
  const resizeReady = ref(false)
  const compact = ref(false)
  const shellWidth = ref(0)
  let shellObserver: ResizeObserver | undefined

  /** 面板打开后至少要给图表留下的宽度；不够时覆盖而不是挤压布局。 */
  function syncCompact(): void {
    compact.value =
      shellWidth.value > 0 && shellWidth.value < width.value + RAIL_WIDTH + MIN_CHART_WIDTH
  }

  // 只发布面板宽度，轨道宽度由 CSS 依开合状态与停靠侧派生，避免同一数值两处来源。
  const shellStyle = computed(() => ({ '--side-panel-width': `${width.value}px` }))

  const activeLabel = computed(
    () => props.panels.find((item) => item.id === activePanel.value)?.label ?? '侧边面板',
  )

  /** 在打开的菜单项与收起之间切换；同一项再次点击即收起面板。 */
  function togglePanel(id: string): void {
    activePanel.value = activePanel.value === id ? null : id
    if (!activePanel.value) return
    if (!mountedPanels.value.some((item) => item.id === id)) {
      mountedPanels.value = [...mountedPanels.value, ...props.panels.filter((item) => item.id === id)]
    }
  }

  const { onPointerOver: onRailPointerOver, onFocusIn: onRailFocusIn, hide: hideRailHighlight } =
    useSlidingHighlight(railHighlight, (target) =>
      target.closest<HTMLElement>('.side-panel-shell__rail-button'),
    )

  /** 关闭面板，保留面板内容挂载状态。 */
  function closePanel(): void {
    activePanel.value = null
  }

  /** 在左右停靠侧之间切换并保存偏好，存储失败不阻断布局交互。 */
  function toggleSide(): void {
    side.value = side.value === 'right' ? 'left' : 'right'
    try {
      props.sideStorage?.save(side.value)
    } catch {
      return
    }
  }

  /** 将宽度限制到允许范围，并返回整数像素值。 */
  function clampWidth(value: number): number {
    return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(value)))
  }

  /** 通过宿主注入的存储保存当前宽度，存储失败不阻断布局交互。 */
  function persistWidth(): void {
    try {
      props.widthStorage?.save(width.value)
    } catch {
      return
    }
  }

  /** 根据停靠侧，用指针到对应容器边缘的距离更新面板宽度。 */
  function updatePanelFromPointer(event: PointerEvent): void {
    const bounds = shell.value?.getBoundingClientRect()
    if (!bounds) return
    width.value = clampWidth(
      side.value === 'right' ? bounds.right - event.clientX : event.clientX - bounds.left,
    )
  }

  /** 结束拖拽，移除文档级监听并保存最终宽度。 */
  function stopResize(): void {
    if (!resizing.value) return
    resizing.value = false
    document.removeEventListener('pointermove', updatePanelFromPointer)
    document.removeEventListener('pointerup', stopResize)
    document.removeEventListener('pointercancel', stopResize)
    persistWidth()
  }

  /** 右侧面板的拖拽命中区在左边缘，左侧面板在右边缘。 */
  function isPanelResizeTarget(clientX: number): boolean {
    const bounds = panel.value?.getBoundingClientRect()
    if (!bounds) return false
    return side.value === 'right'
      ? clientX - bounds.left <= RESIZE_HIT_PX
      : bounds.right - clientX <= RESIZE_HIT_PX
  }

  /** 仅在面板内侧边缘附近显示横向拖拽光标。 */
  function updateResizeCursor(event: PointerEvent): void {
    resizeReady.value = !compact.value && isPanelResizeTarget(event.clientX)
  }

  /** 仅在非紧凑且命中边缘时开始拖拽，拖拽期间由文档级监听接管。 */
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
      storedWidth = props.widthStorage?.load()
    } catch {
      storedWidth = undefined
    }
    if (typeof storedWidth === 'number' && Number.isFinite(storedWidth)) {
      width.value = clampWidth(storedWidth)
    }

    let storedSide: SidePanelSide | null | undefined
    try {
      storedSide = props.sideStorage?.load()
    } catch {
      storedSide = undefined
    }
    if (storedSide === 'left' || storedSide === 'right') side.value = storedSide

    if (shell.value) {
      shellWidth.value = shell.value.getBoundingClientRect().width
      syncCompact()
      shellObserver = new ResizeObserver(([entry]) => {
        if (!entry) return
        shellWidth.value = entry.contentRect.width
        syncCompact()
      })
      shellObserver.observe(shell.value)
    }
  })

  // 面板宽度变化会改变“图表至少保留宽度”的阈值，压缩状态随之更新。
  watch(width, syncCompact)

  // 面板清单收缩（例如宿主关闭 Agent）时，已打开的面板不能继续显示。
  watch(
    () => props.panels,
    (panels) => {
      if (activePanel.value && !panels.some((item) => item.id === activePanel.value)) {
        activePanel.value = null
      }
      mountedPanels.value = mountedPanels.value.filter((item) =>
        panels.some((panelItem) => panelItem.id === item.id),
      )
    },
  )

  onBeforeUnmount(() => {
    shellObserver?.disconnect()
    stopResize()
  })
</script>

<style scoped>
  .side-panel-shell {
    --side-panel-rail-width: 40px;
    /* 面板轨道宽度：开启时等于面板宽度，关闭与紧凑模式下收为 0。 */
    --side-panel-track: 0px;

    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    display: grid;
    /* 三列网格：图表、面板轨道、常驻菜单栏；菜单栏始终贴在最外侧。 */
    grid-template-columns: minmax(0, 1fr) var(--side-panel-track) var(--side-panel-rail-width);
    grid-template-rows: minmax(0, 1fr);
    background: var(--klc-color-ui-background);
  }

  .side-panel-shell--open {
    --side-panel-track: var(--side-panel-width);
  }

  /* 左侧停靠时镜像三列顺序，图表仍占满剩余空间。 */
  .side-panel-shell--left {
    grid-template-columns: var(--side-panel-rail-width) var(--side-panel-track) minmax(0, 1fr);
  }

  .side-panel-shell :deep(button),
  .side-panel-shell :deep(input),
  .side-panel-shell :deep(select),
  .side-panel-shell :deep(textarea) {
    letter-spacing: 0;
  }

  /* 轨道宽度瞬间到位，只触发一次图表 resize；面板位移交给 compositor 的 transform。 */
  .side-panel-shell__chart {
    --kmap-chart-height: 100%;
    --kmap-chart-width: 100%;

    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: var(--klc-color-ui-background);
  }

  .side-panel-shell--left .side-panel-shell__chart {
    grid-column: 3;
  }

  /* 面板占轨道；贴外壳边缘固定，轨道收缩时不会横向跳位，关闭态滑到菜单栏下方隐藏。 */
  .side-panel-shell__panel {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    width: var(--side-panel-width);
    min-height: 0;
    z-index: var(--klc-z-index-chart-overlay);
    overflow: hidden;
    background: var(--klc-color-ui-background);
    visibility: hidden;
    transform: translateX(100%);
    transition:
      transform var(--klc-motion-dur-slow) var(--klc-motion-ease-drawer),
      visibility 0s linear var(--klc-motion-dur-slow);
  }

  .side-panel-shell--left .side-panel-shell__panel {
    justify-self: start;
    transform: translateX(-100%);
  }

  .side-panel-shell--open .side-panel-shell__panel {
    visibility: visible;
    /* 动画结束后退出 transform 合成层，避免文字持续使用纹理栅格化。 */
    transform: none;
    transition:
      transform var(--klc-motion-dur-slow) var(--klc-motion-ease-drawer),
      visibility 0s;
  }

  .side-panel-shell__panel-body {
    height: 100%;
    min-height: 0;
  }

  /* 悬浮在面板内侧边缘时提示左右拖拽。 */
  .side-panel-shell--resize-ready .side-panel-shell__panel {
    cursor: ew-resize;
  }

  /* 常驻菜单栏：外层边缘固定，面板滑入时从其下方穿过。 */
  .side-panel-shell__rail {
    position: relative;
    grid-column: 3;
    grid-row: 1;
    z-index: var(--klc-z-index-sticky);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    box-sizing: border-box;
    padding: var(--klc-space-8, 8px) 0;
    /* 用弱边框 token：菜单栏与图表之间只需一条很轻的分隔线。 */
    border-left: 1px solid var(--klc-color-border-light);
    background: var(--klc-color-ui-surface);
    user-select: none;
  }

  .side-panel-shell--left .side-panel-shell__rail {
    grid-column: 1;
    border-left: 0;
    border-right: 1px solid var(--klc-color-border-light);
  }

  /* 菜单按钮与图表左侧工具栏同形：圆角方块，悬停由滑动高亮块提示。 */
  .side-panel-shell__rail-button {
    position: relative;
    z-index: 1;
    width: 28px;
    height: 28px;
    box-sizing: border-box;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--klc-radius-xs, 4px);
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .side-panel-shell__rail-button:focus-visible {
    color: var(--klc-color-ui-text);
    outline: none;
  }

  .side-panel-shell__rail-button.is-active {
    /* 选中态图标跟随按钮文字色，不参与悬停提亮。 */
    --klc-icon-feedback-color: currentColor;
    --klc-icon-feedback-hover-color: currentColor;
    /* 与左侧工具栏一致：深色模式用浅灰选中底和深色图标。 */
    background: light-dark(
      color-mix(in srgb, var(--klc-color-ui-accent) 14%, transparent),
      color-mix(in srgb, var(--klc-color-ui-text) 90%, var(--klc-color-ui-surface))
    );
    color: light-dark(var(--klc-color-ui-accent), var(--klc-color-ui-background));
  }

  /* 尺寸由菜单栏决定；图标反馈（提亮 + 轻微放大）由 .klc-motion-icon-feedback 统一提供。 */
  .side-panel-shell__rail-button svg {
    width: 16px;
    height: 16px;
  }

  .side-panel-shell__backdrop {
    display: none;
  }

  .side-panel-shell--resizing,
  .side-panel-shell--resizing * {
    cursor: ew-resize !important;
    user-select: none !important;
  }

  /* 紧凑模式：面板改为覆盖层，紧贴菜单栏内侧展开，图表不被压缩。 */
  .side-panel-shell--compact {
    --side-panel-track: 0px;
  }

  .side-panel-shell--compact .side-panel-shell__backdrop {
    position: absolute;
    inset: 0 var(--side-panel-rail-width) 0 0;
    display: block;
    z-index: var(--klc-z-index-chart-overlay);
    border: 0;
    /* 全局遮罩 token：与 BaseModal 共用同一个来源。 */
    background: var(--klc-color-agent-backdrop);
  }

  .side-panel-shell--compact.side-panel-shell--left .side-panel-shell__backdrop {
    inset: 0 0 0 var(--side-panel-rail-width);
  }

  .side-panel-shell--compact .side-panel-shell__panel {
    position: absolute;
    top: 0;
    bottom: 0;
    right: var(--side-panel-rail-width);
    width: min(var(--side-panel-width), calc(100% - var(--side-panel-rail-width) - 28px));
    min-width: min(360px, calc(100% - var(--side-panel-rail-width) - 28px));
    z-index: var(--klc-z-index-chart-overlay);
    border-left: 1px solid var(--klc-color-border-light);
    /* 全局面板投影 token：与 Agent 会话抽屉共用同一个来源。 */
    box-shadow: -12px 0 32px var(--klc-color-agent-panel-shadow);
  }

  .side-panel-shell--compact.side-panel-shell--left .side-panel-shell__panel {
    right: auto;
    left: var(--side-panel-rail-width);
    border-left: 0;
    border-right: 1px solid var(--klc-color-border-light);
    box-shadow: 12px 0 32px var(--klc-color-agent-panel-shadow);
  }
</style>
