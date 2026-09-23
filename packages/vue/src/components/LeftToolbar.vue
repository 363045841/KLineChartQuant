<template>
  <nav class="left-toolbar" aria-label="图表工具栏">
    <div class="left-toolbar__group">
      <BaseTooltip content="指标">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="指标"
          @click="$emit('toggleIndicator')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerMathFunction class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <div v-for="tool in primaryTools" :key="tool.id" class="tool-item">
        <BaseTooltip :content="tool.children?.length ? groupTool(tool).title : tool.title" :disabled="openGroupId !== null">
          <button
            type="button"
            class="left-toolbar__button"
            :class="{ active: isActive(tool) }"
            :aria-label="tool.children?.length ? groupTool(tool).title : tool.title"
            @click="selectTool(tool)"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <component :is="tool.children?.length ? groupTool(tool).icon : tool.icon" class="tool-icon" aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip v-if="tool.children?.length" :content="`${tool.title}工具`" :disabled="openGroupId !== null">
          <button
            type="button"
            class="tool-item__expand"
            :aria-label="`${tool.title}工具`"
            :aria-expanded="openGroupId === tool.id"
            @click="toggleExpand(tool.id)"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <IconTablerChevronRight class="tool-item__expand-icon" aria-hidden="true" />
          </button>
        </BaseTooltip>

        <Transition name="dropdown">
          <div
            v-if="openGroupId === tool.id && tool.children && tool.children.length"
            class="tool-dropdown"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <BaseTooltip
              v-for="child in tool.children"
              :key="child.id"
              :content="child.title"
              placement="top"
            >
              <button
                type="button"
                class="left-toolbar__button"
                :class="{ active: highlightToolId === child.id }"
                :aria-label="child.title"
                @click="selectChild(child)"
              >
                <component :is="child.icon" class="tool-icon" aria-hidden="true" />
              </button>
            </BaseTooltip>
          </div>
        </Transition>
      </div>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <BaseTooltip content="撤回">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="撤回"
          :disabled="!canUndoDrawing"
          @click="$emit('undoDrawing')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerArrowBackUp class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip content="重做">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="重做"
          :disabled="!canRedoDrawing"
          @click="$emit('redoDrawing')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerArrowForwardUp class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <template v-if="alertController">
      <span class="left-toolbar__divider"></span>

      <div class="left-toolbar__group">
        <BaseTooltip content="预警">
          <button
            type="button"
            class="left-toolbar__button"
            :class="{ active: showAlerts }"
            aria-label="预警"
            @click="showAlerts = true"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <IconTablerBell class="tool-icon" aria-hidden="true" />
            <span v-if="unreadCount > 0" class="alert-badge">{{
              unreadCount > 99 ? '99+' : unreadCount
            }}</span>
          </button>
        </BaseTooltip>
      </div>
    </template>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <BaseTooltip content="放大">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="放大"
          @click="$emit('zoomIn')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerZoomIn class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip content="缩小">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="缩小"
          @click="$emit('zoomOut')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerZoomOut class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <BaseTooltip :content="isFullscreen ? '退出全屏' : '全屏显示'">
        <button
          type="button"
          class="left-toolbar__button"
          :aria-label="isFullscreen ? '退出全屏' : '全屏显示'"
          @click="$emit('toggleFullscreen')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerMinimize v-if="isFullscreen" class="tool-icon" aria-hidden="true" />
          <IconTablerMaximize v-else class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <BaseTooltip content="设置">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="设置"
          @click="openSettings"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerSettings class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>
  </nav>

  <ChartSettingsDialog
    :show="showSettings"
    :initial-settings="appliedSettings"
    :renderer-runtime="rendererRuntime"
    :market-data-cache-stats="marketDataCacheStats"
    :aggregation-sources="aggregationSources"
    :enabled-source-names="enabledSourceNames"
    :source-endpoints="sourceEndpoints"
    @close="showSettings = false"
    @confirm="handleConfirmSettings"
    @clear-market-data-cache="emit('clearMarketDataCache')"
    @toggle-aggregation-source="onToggleAggregationSource"
    @update-source-endpoint="onUpdateSourceEndpoint"
  />

  <AlertDialog
    :show="showAlerts"
    :chart-controller="alertController ?? null"
    @close="showAlerts = false"
  />
</template>

<script setup lang="ts">
  import type { ChartController, MarketDataCacheStats } from '@363045841yyt/klinechart-core'
  import {
    type ChartSettings,
    chartSettingsPersistence,
    resolveSettings,
  } from '@363045841yyt/klinechart-core/config'
  import type { RendererBackendRuntime } from '@363045841yyt/klinechart-core/controllers'
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import IconTablerAlignJustified from '~icons/tabler/align-justified'
  import IconTablerAngle from '~icons/tabler/angle'
  import IconTablerArrowBackUp from '~icons/tabler/arrow-back-up'
  import IconTablerArrowForwardUp from '~icons/tabler/arrow-forward-up'
  import IconTablerArrowRight from '~icons/tabler/arrow-right'
  import IconTablerArrowUpRight from '~icons/tabler/arrow-up-right'
  import IconTablerArrowsHorizontal from '~icons/tabler/arrows-horizontal'
  import IconTablerBell from '~icons/tabler/bell'
  import IconTablerChartDots3 from '~icons/tabler/chart-dots-3'
  import IconTablerChartLine from '~icons/tabler/chart-line'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import IconTablerEqual from '~icons/tabler/equal'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerMathFunction from '~icons/tabler/math-function'
  import IconTablerMaximize from '~icons/tabler/maximize'
  import IconTablerMinimize from '~icons/tabler/minimize'
  import IconTablerMinus from '~icons/tabler/minus'
  import IconTablerMinusVertical from '~icons/tabler/minus-vertical'
  import IconTablerPlus from '~icons/tabler/plus'
  import IconTablerPointer from '~icons/tabler/pointer'
  import IconTablerSelect from '~icons/tabler/select'
  import IconTablerSettings from '~icons/tabler/settings'
  import IconTablerShape from '~icons/tabler/shape'
  import IconTablerX from '~icons/tabler/x'
  import IconTablerZoomIn from '~icons/tabler/zoom-in'
  import IconTablerZoomOut from '~icons/tabler/zoom-out'
  import type { AggregationSourceEndpoint } from '../composables/useAggregationSources.js'
  import { useAlerts } from '../composables/useAlerts.js'
  import { setCanvasProfilerEnabled } from '../debug/canvasProfiler.js'
  import AlertDialog from './alert/AlertDialog.vue'
  import ChartSettingsDialog from './ChartSettingsDialog.vue'
  import BaseTooltip from './common/BaseTooltip.vue'

  export interface ToolDef {
    id: string
    title: string
    icon: unknown
    children?: ToolDef[]
  }

  const primaryTools: ToolDef[] = [
    { id: 'cursor', title: '光标', icon: IconTablerPointer },
    { id: 'box-select', title: '框选', icon: IconTablerSelect },
    {
      id: 'lines',
      title: '线条',
      icon: IconTablerChartLine,
      children: [
        { id: 'trend-line', title: '线段', icon: IconTablerChartLine },
        { id: 'ray', title: '射线', icon: IconTablerArrowUpRight },
        { id: 'h-line', title: '水平线', icon: IconTablerMinus },
        { id: 'h-ray', title: '水平射线', icon: IconTablerArrowRight },
        { id: 'v-line', title: '垂直线', icon: IconTablerMinusVertical },
        { id: 'crosshair-line', title: '十字线', icon: IconTablerPlus },
        { id: 'info-line', title: '信息线', icon: IconTablerInfoCircle },
      ],
    },
    {
      id: 'channels',
      title: '通道',
      icon: IconTablerEqual,
      children: [
        { id: 'parallel-channel', title: '平行通道', icon: IconTablerEqual },
        { id: 'regression-channel', title: '回归趋势', icon: IconTablerChartDots3 },
        { id: 'flat-line', title: '平滑顶底', icon: IconTablerAngle },
        { id: 'disjoint-channel', title: '不相交通道', icon: IconTablerX },
      ],
    },
    {
      id: 'annotations',
      title: '标注',
      icon: IconTablerShape,
      children: [
        { id: 'fib-retracement', title: '斐波那契回撤', icon: IconTablerAlignJustified },
        { id: 'rectangle', title: '矩形', icon: IconTablerShape },
        { id: 'arrow', title: '箭头', icon: IconTablerArrowUpRight },
      ],
    },
    { id: 'range-select', title: '区间选择', icon: IconTablerArrowsHorizontal },
  ]
  const emit = defineEmits<{
    (e: 'selectTool', toolId: string): void
    (e: 'toggleFullscreen'): void
    (e: 'toggleIndicator'): void
    (e: 'zoomIn'): void
    (e: 'zoomOut'): void
    (e: 'undoDrawing'): void
    (e: 'redoDrawing'): void
    (e: 'settingsChange', settings: ChartSettings): void
    (e: 'clearMarketDataCache'): void
    (e: 'toggleAggregationSource', name: string, enabled: boolean): void
    (e: 'updateSourceEndpoint', name: string, patch: Partial<AggregationSourceEndpoint>): void
  }>()

  const props = withDefaults(
    defineProps<{
      isFullscreen?: boolean
      alertController?: ChartController | null
      effectiveSettings?: ChartSettings
      rendererRuntime?: RendererBackendRuntime | null
      marketDataCacheStats?: MarketDataCacheStats
      /** kernel drawingTool 镜像；高亮以它为准 */
      drawingToolId?: string
      canUndoDrawing?: boolean
      canRedoDrawing?: boolean
      /** range-select 本地模式 */
      isRangeSelectMode?: boolean
      aggregationSources?: ReadonlyArray<
        import('../composables/useAggregationSources.js').AggregationSourceDefinition
      >
      enabledSourceNames?: ReadonlySet<string>
      sourceEndpoints?: Record<string, AggregationSourceEndpoint>
    }>(),
    {
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
      sourceEndpoints: () => ({}),
    },
  )

  const { unreadCount } = useAlerts(() => props.alertController ?? null)

  const selectedToolId = ref('cursor')
  const groupSelections = ref<Record<string, string>>({})
  const openGroupId = ref<string | null>(null)
  const showSettings = ref(false)
  const showAlerts = ref(false)

  /** 高亮 id：range 模式优先，否则 kernel tool，否则本地 click 缓存 */
  const highlightToolId = computed(() => {
    if (props.isRangeSelectMode) return 'range-select'
    return props.drawingToolId ?? selectedToolId.value
  })

  function loadSettings(): ChartSettings {
    return resolveSettings()
  }

  function saveSettings(settings: ChartSettings) {
    chartSettingsPersistence.save(settings)
  }

  // 父组件已 seed 的 effectiveSettings 优先；否则读 localStorage
  const appliedSettings = ref<ChartSettings>(
    props.effectiveSettings && Object.keys(props.effectiveSettings).length > 0
      ? { ...props.effectiveSettings }
      : loadSettings(),
  )

  watch(
    () => props.effectiveSettings,
    (val) => {
      if (val) appliedSettings.value = { ...val }
    },
    { deep: true },
  )

  function isActive(tool: ToolDef): boolean {
    const id = highlightToolId.value
    if (tool.id === id) return true
    if (tool.children) {
      return tool.children.some((c) => c.id === id)
    }
    return false
  }

  function groupTool(tool: ToolDef): ToolDef {
    return (
      tool.children?.find((child) => child.id === groupSelections.value[tool.id]) ??
      tool.children![0]!
    )
  }

  watch(
    () => props.drawingToolId,
    (id) => {
      if (!id) return
      for (const tool of primaryTools) {
        if (tool.children?.some((child) => child.id === id)) {
          groupSelections.value[tool.id] = id
          break
        }
      }
    },
    { immediate: true },
  )

  function selectTool(tool: ToolDef) {
    if (tool.children?.length) {
      const child = groupTool(tool)
      selectedToolId.value = child.id
      emit('selectTool', child.id)
      openGroupId.value = null
      return
    }
    selectedToolId.value = tool.id
    emit('selectTool', tool.id)
    openGroupId.value = null
  }

  function selectChild(child: ToolDef) {
    selectedToolId.value = child.id
    for (const tool of primaryTools) {
      if (tool.children?.some((item) => item.id === child.id)) {
        groupSelections.value[tool.id] = child.id
        break
      }
    }
    emit('selectTool', child.id)
    openGroupId.value = null
  }

  function toggleExpand(groupId: string) {
    openGroupId.value = openGroupId.value === groupId ? null : groupId
  }

  function openSettings() {
    showSettings.value = true
  }

  function onToggleAggregationSource(name: string, enabled: boolean) {
    emit('toggleAggregationSource', name, enabled)
  }

  function onUpdateSourceEndpoint(name: string, patch: Partial<AggregationSourceEndpoint>) {
    emit('updateSourceEndpoint', name, patch)
  }

  function handleConfirmSettings(draft: ChartSettings) {
    appliedSettings.value = { ...draft }
    saveSettings(appliedSettings.value)
    setCanvasProfilerEnabled(!!appliedSettings.value['enableCanvasProfiler'])
    emit('settingsChange', { ...appliedSettings.value })
    showSettings.value = false
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.tool-item')) {
      openGroupId.value = null
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside, true)
    emit('settingsChange', { ...appliedSettings.value })
    setCanvasProfilerEnabled(!!appliedSettings.value['enableCanvasProfiler'])
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside, true)
  })
</script>

<style scoped>
  .left-toolbar {
    flex: 0 0 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 3px;
    background: var(--klc-color-ui-surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    user-select: none;
    /* 子工具菜单向右绝对定位，工具栏不能裁剪该浮层。 */
    overflow: visible;
  }

  .left-toolbar__group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .left-toolbar__divider {
    width: 18px;
    height: 1px;
    background: var(--klc-color-ui-border);
  }

  /* --- 工具按钮 --- */
  .left-toolbar__button {
    position: relative;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .left-toolbar__button:hover {
    border-color: var(--klc-color-ui-border);
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .left-toolbar__button:disabled,
  .left-toolbar__button:disabled:hover {
    border-color: transparent;
    background: transparent;
    color: var(--klc-color-ui-muted);
    opacity: 0.5;
    cursor: default;
  }

  .left-toolbar__button.active {
    border-color: var(--klc-color-ui-border);
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .left-toolbar__button:focus-visible {
    outline: none;
    border-color: var(--klc-color-ui-muted);
  }

  .tool-icon {
    width: 16px;
    height: 16px;
  }

  .tool-item__expand {
    position: absolute;
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .tool-item:hover .tool-item__expand,
  .tool-item:focus-within .tool-item__expand {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .tool-item__expand-icon {
    width: 10px;
    height: 10px;
  }

  .tool-item__expand:hover,
  .tool-item__expand[aria-expanded='true'] {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .tool-item__expand:focus-visible {
    outline: 1px solid var(--klc-color-ui-muted);
  }

  /* --- 下拉菜单（与工具栏同配色、同按钮样式，高度对齐工具栏宽度） --- */
  .tool-dropdown {
    position: absolute;
    left: calc(100% + 16px);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    padding: 0 5px;
    height: 40px;
    background: var(--klc-color-ui-surface);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 3px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    z-index: 100;
  }

  /* --- 工具项容器 --- */
  .tool-item {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* --- 下拉动画 --- */
  .dropdown-enter-active,
  .dropdown-leave-active {
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }

  .dropdown-enter-from,
  .dropdown-leave-to {
    opacity: 0;
    transform: translateY(-50%) translateX(-6px);
  }

  /* --- 预警按钮徽标 --- */
  .alert-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    display: inline-grid;
    place-items: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    background: var(--klc-color-ui-danger);
    color: var(--klc-color-ui-on-accent);
    font:
      10px / 1 system-ui,
      sans-serif;
    font-variant-numeric: tabular-nums;
    border-radius: 999px;
    pointer-events: none;
    transform: translateY(-1px) translateX(1px);
  }

  /* --- 响应式 --- */
  @media (max-width: 768px), (max-height: 640px) {
    .left-toolbar {
      flex-basis: 50px;
      padding: 6px 0;
      gap: 5px;
      border-radius: 3px;
    }

    .left-toolbar__group {
      gap: 3px;
    }

    .left-toolbar__button {
      width: 26px;
      height: 26px;
      border-radius: 3px;
    }

    .left-toolbar__divider {
      width: 16px;
    }

    .tool-item__expand {
      height: 20px;
    }

    .tool-dropdown {
      height: 36px;
    }
  }
</style>
