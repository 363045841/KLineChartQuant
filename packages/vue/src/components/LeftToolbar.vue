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
        <BaseTooltip v-if="tool.children?.length" :content="`${tool.title}工具`" placement="top" :disabled="openGroupId !== null">
          <button
            type="button"
            class="tool-item__expand"
            :aria-label="`${tool.title}工具`"
            :aria-expanded="openGroupId === tool.id"
            @click="openGroupMenu(tool, $event)"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <IconTablerChevronRight class="tool-item__expand-icon" aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <div class="tool-item">
        <BaseTooltip :content="`磁吸：${magnetSelection.title}`" :disabled="openGroupId !== null">
          <button
            type="button"
            class="left-toolbar__button"
            :class="{ active: magnetMode !== MagnetMode.Off }"
            :aria-label="`磁吸：${magnetSelection.title}`"
            :aria-pressed="magnetMode !== MagnetMode.Off"
            @click="toggleMagnet"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <component :is="magnetSelection.icon" class="tool-icon" aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip content="磁吸选项" placement="top" :disabled="openGroupId !== null">
          <button
            type="button"
            class="tool-item__expand"
            aria-label="磁吸选项"
            :aria-expanded="openGroupId === magnetGroup.id"
            @click="openGroupMenu(magnetGroup, $event)"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <IconTablerChevronRight class="tool-item__expand-icon" aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
    </div>

    <div class="left-toolbar__group">
      <BaseTooltip :content="continuousDrawing ? '关闭连续绘图' : '开启连续绘图'">
        <button
          type="button"
          class="left-toolbar__button"
          :class="{ active: continuousDrawing }"
          aria-label="连续绘图"
          :aria-pressed="continuousDrawing"
          @click="emit('setContinuousDrawing', !continuousDrawing)"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerPencil class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <BaseTooltip :content="globalDrawingLocked ? '解锁全部图元' : '锁定全部图元'">
        <button
          type="button"
          class="left-toolbar__button"
          :class="{ active: globalDrawingLocked }"
          :aria-label="globalDrawingLocked ? '解锁全部图元' : '锁定全部图元'"
          :disabled="!hasDrawings && !globalDrawingLocked"
          @click="toggleGlobalDrawingLock"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerLock v-if="globalDrawingLocked" class="tool-icon" aria-hidden="true" />
          <IconTablerLockOpen v-else class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip :content="allDrawingsHidden ? '显示所有图元' : '隐藏所有图元'">
        <button
          type="button"
          class="left-toolbar__button"
          :class="{ active: allDrawingsHidden }"
          :aria-label="allDrawingsHidden ? '显示所有图元' : '隐藏所有图元'"
          :aria-pressed="allDrawingsHidden"
          :disabled="!hasDrawings"
          @click="emit('setAllDrawingsVisible', allDrawingsHidden)"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerEyeOff v-if="allDrawingsHidden" class="tool-icon" aria-hidden="true" />
          <IconTablerEye v-else class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <div class="left-toolbar__group">
      <div class="tool-item">
        <BaseTooltip :content="selectedDeleteTool.title" :disabled="openGroupId !== null">
          <button
            type="button"
            class="left-toolbar__button"
            :aria-label="selectedDeleteTool.title"
            :disabled="selectedDeleteTool.id === 'drawings' ? !hasDrawings : !hasIndicators"
            @click="runDelete(selectedDeleteTool.id)"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <component :is="selectedDeleteTool.icon" class="tool-icon" aria-hidden="true" />
          </button>
        </BaseTooltip>
        <BaseTooltip content="删除选项" placement="top" :disabled="openGroupId !== null">
          <button
            type="button"
            class="tool-item__expand"
            aria-label="删除选项"
            :aria-expanded="openGroupId === deleteGroup.id"
            :disabled="!hasDrawings && !hasIndicators"
            @click="openGroupMenu(deleteGroup, $event)"
            @pointerdown.stop
            @pointermove.stop
            @pointerup.stop
          >
            <IconTablerChevronRight class="tool-item__expand-icon" aria-hidden="true" />
          </button>
        </BaseTooltip>
      </div>
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

  </nav>

  <Teleport :to="teleportTarget">
    <div
      v-if="openGroup"
      ref="menuRef"
      class="tool-dropdown"
      :style="dropdownPosition"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
    >
      <div class="tool-dropdown__title">{{ openGroup.title }}</div>
      <button
        v-for="child in openGroup.children"
        :key="child.id"
        type="button"
        class="tool-dropdown__item"
        :class="{ active: openGroup.id === magnetGroup.id ? magnetMode === child.id : highlightToolId === child.id }"
        :aria-label="child.title"
        :aria-pressed="openGroup.id === magnetGroup.id ? magnetMode === child.id : undefined"
        :disabled="openGroup.id === deleteGroup.id && (child.id === 'drawings' ? !hasDrawings : !hasIndicators)"
        @click="selectChild(openGroup, child)"
      >
        <component :is="child.icon" class="tool-icon" aria-hidden="true" />
        <span>{{ child.title }}</span>
      </button>
    </div>
  </Teleport>

  <ChartSettingsDialog
    :show="showSettings"
    :controller="alertController ?? undefined"
    :renderer-runtime="rendererRuntime"
    :market-data-cache-stats="marketDataCacheStats"
    :aggregation-sources="aggregationSources"
    :enabled-source-names="enabledSourceNames"
    :source-endpoints="sourceEndpoints"
    @close="showSettings = false"
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
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import {
    type ActiveMagnetMode,
    BOX_SELECT_DRAWING_TOOL_ID,
    CURSOR_DRAWING_TOOL_ID,
    DrawingTool,
    MagnetMode,
    type RendererBackendRuntime,
  } from '@363045841yyt/klinechart-core/controllers'
  import { computed, ref, toRef, watch } from 'vue'
  import IconTablerAlignJustified from '~icons/tabler/align-justified'
  import IconTablerAngle from '~icons/tabler/angle'
  import IconTablerArrowRight from '~icons/tabler/arrow-right'
  import IconTablerArrowUpRight from '~icons/tabler/arrow-up-right'
  import IconTablerArrowsHorizontal from '~icons/tabler/arrows-horizontal'
  import IconTablerBell from '~icons/tabler/bell'
  import IconTablerChartDots3 from '~icons/tabler/chart-dots-3'
  import IconTablerChartLine from '~icons/tabler/chart-line'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import IconTablerEqual from '~icons/tabler/equal'
  import IconTablerEraser from '~icons/tabler/eraser'
  import IconTablerEye from '~icons/tabler/eye'
  import IconTablerEyeOff from '~icons/tabler/eye-off'
  import IconTablerInfoCircle from '~icons/tabler/info-circle'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerLockOpen from '~icons/tabler/lock-open'
  import IconTablerMagnet from '~icons/tabler/magnet'
  import IconTablerMagnetFilled from '~icons/tabler/magnet-filled'
  import IconTablerMagnetOff from '~icons/tabler/magnet-off'
  import IconTablerMarquee2 from '~icons/tabler/marquee-2'
  import IconTablerMathFunction from '~icons/tabler/math-function'
  import IconTablerMinus from '~icons/tabler/minus'
  import IconTablerMinusVertical from '~icons/tabler/minus-vertical'
  import IconTablerPencil from '~icons/tabler/pencil'
  import IconTablerPlus from '~icons/tabler/plus'
  import IconTablerPointer from '~icons/tabler/pointer'
  import IconTablerShape from '~icons/tabler/shape'
  import IconTablerTrash from '~icons/tabler/trash'
  import IconTablerX from '~icons/tabler/x'
  import IconTablerZoomIn from '~icons/tabler/zoom-in'
  import IconTablerZoomOut from '~icons/tabler/zoom-out'
  import { useControllerSignal } from '../composables/chart/useControllerSignal.js'
  import { injectCommands, useRegisterCommands } from '../composables/commands/useCommands.js'
  import type { AggregationSourceEndpoint } from '../composables/useAggregationSources.js'
  import { useAlerts } from '../composables/useAlerts.js'
  import { useClickOutside } from '../composables/useClickOutside.js'
  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'
  import AlertDialog from './alert/AlertDialog.vue'
  import ChartSettingsDialog from './ChartSettingsDialog.vue'
  import BaseTooltip from './common/BaseTooltip.vue'
  import { RANGE_SELECT_UI_TOOL_ID } from './toolbarToolIds.js'

  export interface ToolDef {
    id: string
    title: string
    icon: unknown
    children?: ToolDef[]
  }

  const primaryTools: ToolDef[] = [
    { id: CURSOR_DRAWING_TOOL_ID, title: '光标', icon: IconTablerPointer },
    { id: BOX_SELECT_DRAWING_TOOL_ID, title: '框选', icon: IconTablerMarquee2 },
    {
      id: 'lines',
      title: '线条',
      icon: IconTablerChartLine,
      children: [
        { id: DrawingTool.TrendLine, title: '线段', icon: IconTablerChartLine },
        { id: DrawingTool.Ray, title: '射线', icon: IconTablerArrowUpRight },
        { id: DrawingTool.HorizontalLine, title: '水平线', icon: IconTablerMinus },
        { id: DrawingTool.HorizontalRay, title: '水平射线', icon: IconTablerArrowRight },
        { id: DrawingTool.VerticalLine, title: '垂直线', icon: IconTablerMinusVertical },
        { id: DrawingTool.CrosshairLine, title: '十字线', icon: IconTablerPlus },
        { id: DrawingTool.InfoLine, title: '信息线', icon: IconTablerInfoCircle },
      ],
    },
    {
      id: 'channels',
      title: '通道',
      icon: IconTablerEqual,
      children: [
        { id: DrawingTool.ParallelChannel, title: '平行通道', icon: IconTablerEqual },
        { id: DrawingTool.RegressionChannel, title: '回归趋势', icon: IconTablerChartDots3 },
        { id: DrawingTool.FlatLine, title: '平滑顶底', icon: IconTablerAngle },
        { id: DrawingTool.DisjointChannel, title: '不相交通道', icon: IconTablerX },
      ],
    },
    {
      id: 'annotations',
      title: '标注',
      icon: IconTablerShape,
      children: [
        { id: DrawingTool.FibRetracement, title: '斐波那契回撤', icon: IconTablerAlignJustified },
        { id: DrawingTool.Rectangle, title: '矩形', icon: IconTablerShape },
        { id: DrawingTool.Arrow, title: '箭头', icon: IconTablerArrowUpRight },
      ],
    },
    { id: RANGE_SELECT_UI_TOOL_ID, title: '区间选择', icon: IconTablerArrowsHorizontal },
  ]
  const deleteGroup: ToolDef = {
    id: 'delete',
    title: '删除',
    icon: IconTablerTrash,
    children: [
      { id: 'drawings', title: '删除所有绘图', icon: IconTablerEraser },
      { id: 'indicators', title: '移除所有指标', icon: IconTablerMathFunction },
    ],
  }
  const magnetGroup: ToolDef = {
    id: 'magnet',
    title: '磁吸',
    icon: IconTablerMagnet,
    children: [
      { id: MagnetMode.Strong, title: '强磁铁', icon: IconTablerMagnetFilled },
      { id: MagnetMode.Weak, title: '弱磁铁', icon: IconTablerMagnet },
      { id: MagnetMode.Off, title: '关闭磁吸', icon: IconTablerMagnetOff },
    ],
  }
  const emit = defineEmits<{
    (e: 'selectTool', toolId: string): void
    (e: 'setMagnetMode', mode: MagnetMode): void
    (e: 'setContinuousDrawing', enabled: boolean): void
    (e: 'toggleIndicator'): void
    (e: 'zoomIn'): void
    (e: 'zoomOut'): void
    (e: 'clearDrawings'): void
    (e: 'clearIndicators'): void
    (e: 'setGlobalDrawingLock', locked: boolean): void
    (e: 'setAllDrawingsVisible', visible: boolean): void
    /** @deprecated 设置由 controller.settingsCommands 直接写入；仅为兼容旧监听者保留，随设置信号变化触发。 */
    (e: 'settingsChange', settings: ChartSettings): void
    (e: 'clearMarketDataCache'): void
    (e: 'toggleAggregationSource', name: string, enabled: boolean): void
    (e: 'updateSourceEndpoint', name: string, patch: Partial<AggregationSourceEndpoint>): void
  }>()

  const props = withDefaults(
    defineProps<{
      alertController?: ChartController | null
      /** @deprecated 设置只读 controller.settings 信号（ADR 0006），此 prop 不再使用。 */
      effectiveSettings?: ChartSettings
      rendererRuntime?: RendererBackendRuntime | null
      marketDataCacheStats?: MarketDataCacheStats
      /** kernel drawingTool 镜像；高亮以它为准 */
      drawingToolId?: string
      magnetMode?: MagnetMode
      continuousDrawing?: boolean
      /** 是否存在已确认图元；无图元且未锁定时禁用全部锁定按钮 */
      hasDrawings?: boolean
      hasIndicators?: boolean
      allDrawingsHidden?: boolean
      /** 全局绘图锁定状态：为 true 时全部图元不可移动 */
      globalDrawingLocked?: boolean
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
      magnetMode: MagnetMode.Off,
    },
  )

  const { unreadCount } = useAlerts(() => props.alertController ?? null)

  const selectedToolId = ref<string>(CURSOR_DRAWING_TOOL_ID)
  const groupSelections = ref<Record<string, string>>({})
  const selectedDeleteTool = computed(
    () =>
      deleteGroup.children!.find((child) => child.id === groupSelections.value[deleteGroup.id]) ??
      deleteGroup.children![0]!,
  )
  /** 主按钮下次开启磁吸时恢复的档位（off 不计入）。 */
  const lastActiveMagnetMode = ref<ActiveMagnetMode>(MagnetMode.Strong)
  const openGroupId = ref<string | null>(null)
  const openGroup = computed(() =>
    openGroupId.value === deleteGroup.id
      ? deleteGroup
      : openGroupId.value === magnetGroup.id
        ? magnetGroup
        : primaryTools.find((tool) => tool.id === openGroupId.value),
  )
  const magnetSelection = computed(
    () =>
      magnetGroup.children!.find((child) => child.id === props.magnetMode) ??
      magnetGroup.children![2]!,
  )
  watch(
    () => props.magnetMode,
    (mode) => {
      if (mode !== MagnetMode.Off) lastActiveMagnetMode.value = mode
    },
    { immediate: true },
  )
  const triggerRef = ref<HTMLElement | null>(null)
  const menuRef = ref<HTMLElement | null>(null)
  const teleportTarget = useFullscreenTeleportTarget()
  const dropdownPosition = ref({ '--menu-anchor-left': '0px', '--menu-anchor-top': '0px' })
  const showSettings = defineModel<boolean>('settingsOpen', { default: false })
  const showAlerts = ref(false)

  /** 高亮 id：range 模式优先，否则 kernel tool，否则本地 click 缓存 */
  const highlightToolId = computed(() => {
    if (props.isRangeSelectMode) return RANGE_SELECT_UI_TOOL_ID
    return props.drawingToolId ?? selectedToolId.value
  })

  // 兼容旧的 settingsChange 监听者：设置只来自 controller 信号，这里只转发，不持有副本。
  const controllerSettings = useControllerSignal(
    toRef(() => props.alertController ?? null),
    (ctrl) => ctrl.settings,
    () => ({}) as ChartSettings,
  )
  watch(controllerSettings, (next) => emit('settingsChange', { ...next }))

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

  function selectChild(group: ToolDef, child: ToolDef) {
    if (group.id === deleteGroup.id) {
      groupSelections.value[group.id] = child.id
      runDelete(child.id)
      openGroupId.value = null
      return
    }
    if (group.id === magnetGroup.id) {
      // 磁吸子项的 id 就是 MagnetMode 的三个取值。
      setMagnetMode(child.id as MagnetMode)
      openGroupId.value = null
      return
    }
    selectedToolId.value = child.id
    groupSelections.value[group.id] = child.id
    emit('selectTool', child.id)
    openGroupId.value = null
  }

  function runDelete(id: string) {
    if (id === 'drawings' && props.hasDrawings) emit('clearDrawings')
    if (id === 'indicators' && props.hasIndicators) emit('clearIndicators')
  }

  /** 切换磁吸开关：关闭时再次点击恢复上次使用的吸附档位。 */
  function setMagnetMode(mode: MagnetMode): void {
    if (mode !== MagnetMode.Off) lastActiveMagnetMode.value = mode
    emit('setMagnetMode', mode)
  }

  function toggleMagnet() {
    setMagnetMode(props.magnetMode === MagnetMode.Off ? lastActiveMagnetMode.value : MagnetMode.Off)
    openGroupId.value = null
  }

  function openGroupMenu(group: ToolDef, event: MouseEvent) {
    if (openGroupId.value === group.id) return
    const trigger = event.currentTarget as HTMLElement
    const bounds = trigger.getBoundingClientRect()
    triggerRef.value = trigger
    const menuHeight = 42 + (group.children?.length ?? 0) * 30
    dropdownPosition.value = {
      '--menu-anchor-left': `${bounds.right}px`,
      '--menu-anchor-top': `${Math.max(8, Math.min(bounds.top, window.innerHeight - menuHeight - 8))}px`,
    }
    openGroupId.value = group.id
  }

  useClickOutside(
    () => [triggerRef.value, menuRef.value],
    () => {
      openGroupId.value = null
    },
    { enabled: () => openGroupId.value !== null },
  )

  const commands = injectCommands()

  watch(openGroupId, (id, _previous, onCleanup) => {
    if (!id) return
    const close = () => {
      openGroupId.value = null
    }
    const onScroll = (event: Event) => {
      if (menuRef.value?.contains(event.target as Node)) return
      close()
    }
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    // 脱离图表单独使用时没有命令层，退回到局部 Esc 监听。
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    if (!commands) document.addEventListener('keydown', onKeydown)
    onCleanup(() => {
      document.removeEventListener('scroll', onScroll, true)
      if (!commands) document.removeEventListener('keydown', onKeydown)
      window.removeEventListener('resize', close)
    })
  })

  // Esc 关闭工具分组菜单：注册为命令，由图表命令层统一分发。
  useRegisterCommands(commands, () => [
    {
      id: 'toolbar.closeMenu',
      group: 'general',
      title: { zh: '关闭工具菜单', en: 'Close tool menu' },
      shortcut: 'Escape',
      scope: 'global',
      palette: false,
      when: () => openGroupId.value !== null,
      run: () => {
        openGroupId.value = null
      },
    },
  ])

  /** 点击全局锁定按钮：按当前状态取反，切换全局绘图锁定。 */
  function toggleGlobalDrawingLock() {
    emit('setGlobalDrawingLock', !props.globalDrawingLocked)
  }

  function onToggleAggregationSource(name: string, enabled: boolean) {
    emit('toggleAggregationSource', name, enabled)
  }

  function onUpdateSourceEndpoint(name: string, patch: Partial<AggregationSourceEndpoint>) {
    emit('updateSourceEndpoint', name, patch)
  }
</script>

<style scoped>
  .left-toolbar,
  .tool-dropdown {
    --tool-button-size: 28px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 3px;
    background: var(--klc-color-ui-surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
  }

  .left-toolbar {
    border-radius: 0 0 0 var(--chart-frame-radius, 3px);
    border-top: 0;
    border-right: 0;
    flex: 0 0 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    user-select: none;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    overscroll-behavior-y: contain;
  }

  .left-toolbar::-webkit-scrollbar {
    display: none;
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
    width: var(--tool-button-size);
    height: var(--tool-button-size);
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
    border-color: transparent;
    background: color-mix(in srgb, var(--klc-color-ui-accent) 14%, transparent);
    color: var(--klc-color-ui-accent);
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
    height: var(--tool-button-size);
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    opacity: 0;
  }

  .tool-item:hover .tool-item__expand,
  .tool-item:focus-within .tool-item__expand {
    opacity: 1;
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

  /* --- 工具组纵向菜单 --- */
  .tool-dropdown {
    --menu-left: clamp(8px, calc(var(--menu-anchor-left) + 4px), max(8px, calc(100vw - 188px)));
    position: fixed;
    left: var(--menu-left);
    top: var(--menu-anchor-top);
    display: flex;
    flex-direction: column;
    width: 180px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    padding: 4px 0 0;
    border-radius: 8px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 100;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .tool-dropdown__title {
    flex: 0 0 32px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
  }

  .tool-dropdown__item {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 30px;
    width: 100%;
    padding: 0 8px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .tool-dropdown__item .tool-icon {
    flex-shrink: 0;
    color: var(--klc-color-ui-muted);
  }

  .tool-dropdown__item:hover,
  .tool-dropdown__item.active {
    background: var(--klc-color-ui-hover);
  }

  .tool-dropdown__item:focus-visible {
    outline: 1px solid var(--klc-color-ui-muted);
    outline-offset: -1px;
  }

  .tool-dropdown__item:disabled {
    background: transparent;
    opacity: 0.5;
    cursor: default;
  }

  /* --- 工具项容器 --- */
  .tool-item {
    position: relative;
    display: flex;
    align-items: center;
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
    .left-toolbar,
    .tool-dropdown {
      --tool-button-size: 26px;
    }

    .left-toolbar {
      flex-basis: 50px;
      padding: 6px 0;
      gap: 5px;
    }

    .left-toolbar__group {
      gap: 3px;
    }

    .left-toolbar__divider {
      width: 16px;
    }
  }
</style>
