<template>
  <nav
    class="left-toolbar"
    aria-label="图表工具栏"
    @pointerover="onPointerOver"
    @pointerleave="hideHighlight"
    @focusin="onFocusIn"
    @focusout="hideHighlight"
  >
    <SlidingHighlight ref="highlight" class="left-toolbar__highlight" />
    <div class="left-toolbar__group">
      <BaseTooltip v-if="scriptsEnabled !== false" content="代码编辑器">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="代码编辑器"
          :disabled="!scriptsReady"
          @click="emit('openScriptEditor')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerCode class="tool-icon" aria-hidden="true" />
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

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group">
      <BaseTooltip content="预警">
        <button
          type="button"
          class="left-toolbar__button"
          :class="{ active: showAlerts }"
          aria-label="预警"
          :disabled="!alertController"
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

    <span class="left-toolbar__divider"></span>

    <div class="left-toolbar__group left-toolbar__group--bottom">
      <BaseTooltip placement="top">
        <template #content>
          <span class="github-tooltip">
            <span class="github-tooltip__meta">
              <span class="github-tooltip__label">Vue</span>
              <span class="github-tooltip__value">{{ VERSION }}</span>
              <span class="github-tooltip__label">Core</span>
              <span class="github-tooltip__value">{{ CORE_VERSION }}</span>
              <span class="github-tooltip__label">Commit</span>
              <span class="github-tooltip__value">{{ COMMIT_HASH }}</span>
              <span class="github-tooltip__time">{{ COMMIT_TIME }}</span>
            </span>
          </span>
        </template>
        <a
          class="left-toolbar__button"
          :href="PROJECT_REPOSITORY_URL"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerBrandGithub class="tool-icon" aria-hidden="true" />
        </a>
      </BaseTooltip>
      <BaseTooltip content="命令面板" command="palette.open">
        <button
          type="button"
          class="left-toolbar__button"
          aria-label="命令面板"
          @click="emit('openCommandPalette')"
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
        >
          <IconTablerCommand class="tool-icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

  </nav>

  <DropMenu
    ref="groupMenuRef"
    context
    :label="openGroup?.title ?? '工具菜单'"
    :groups="openGroup ? menuGroups(openGroup) : []"
    :focus-target="groupTrigger"
    @select="onGroupMenuSelect"
    @close="openGroupId = null"
  >
  </DropMenu>

  <AlertDialog
    :show="showAlerts"
    :chart-controller="alertController ?? null"
    @close="showAlerts = false"
  />
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core'
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import {
    type ActiveMagnetMode,
    BOX_SELECT_DRAWING_TOOL_ID,
    CURSOR_DRAWING_TOOL_ID,
    DrawingTool,
    MagnetMode,
  } from '@363045841yyt/klinechart-core/controllers'
  import AlertDialog from '@vue-src/components/alert/AlertDialog.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'
  import { useAlerts } from '@vue-src/composables/alerts/useAlerts.js'
  import { setCanvasProfilerEnabled } from '@vue-src/debug/canvasProfiler.js'
  import { PROJECT_REPOSITORY_URL } from '@vue-src/productLinks.js'
  import { COMMIT_HASH, COMMIT_TIME, CORE_VERSION, VERSION } from '@vue-src/version.js'
  import { type Component, computed, ref, shallowRef, watch } from 'vue'
  import IconTablerAlignJustified from '~icons/tabler/align-justified'
  import IconTablerAngle from '~icons/tabler/angle'
  import IconTablerArrowRight from '~icons/tabler/arrow-right'
  import IconTablerArrowUpRight from '~icons/tabler/arrow-up-right'
  import IconTablerArrowsHorizontal from '~icons/tabler/arrows-horizontal'
  import IconTablerBell from '~icons/tabler/bell'
  import IconTablerBrandGithub from '~icons/tabler/brand-github'
  import IconTablerChartDots3 from '~icons/tabler/chart-dots-3'
  import IconTablerChartLine from '~icons/tabler/chart-line'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import IconTablerCode from '~icons/tabler/code'
  import IconTablerCommand from '~icons/tabler/command'
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
  import { RANGE_SELECT_UI_TOOL_ID } from './toolbarToolIds.js'

  interface ToolDef {
    id: string
    title: string
    icon: Component
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
    (e: 'openScriptEditor'): void
    (e: 'clearDrawings'): void
    (e: 'clearIndicators'): void
    (e: 'setGlobalDrawingLock', locked: boolean): void
    (e: 'setAllDrawingsVisible', visible: boolean): void
    (e: 'openCommandPalette'): void
  }>()

  const props = withDefaults(
    defineProps<{
      alertController?: ChartController | null
      scriptsEnabled?: boolean
      /** 脚本服务是否就绪；未就绪时按钮常驻但禁用，避免首屏插入按钮挤动下方分组。 */
      scriptsReady?: boolean
      effectiveSettings?: ChartSettings
      /** Core 当前 drawingTool；工具栏高亮以它为准 */
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
    }>(),
    {
      magnetMode: MagnetMode.Off,
      scriptsReady: true,
    },
  )

  const { unreadCount } = useAlerts(() => props.alertController ?? null)

  const highlight = ref<InstanceType<typeof SlidingHighlight> | null>(null)

  /** 指针移动到工具按钮时驱动滑动高亮块；展开箭头跟随其所属按钮。 */
  function onPointerOver(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null
    const button =
      target?.closest<HTMLElement>('.left-toolbar__button') ??
      target
        ?.closest<HTMLElement>('.tool-item')
        ?.querySelector<HTMLElement>('.left-toolbar__button')
    if (button) highlight.value?.moveTo(button)
    else highlight.value?.hide()
  }

  /** 键盘焦点进入工具按钮时与指针同样驱动高亮块。 */
  function onFocusIn(event: FocusEvent): void {
    const target = event.target instanceof Element ? event.target : null
    const button =
      target?.closest<HTMLElement>('.left-toolbar__button') ??
      target
        ?.closest<HTMLElement>('.tool-item')
        ?.querySelector<HTMLElement>('.left-toolbar__button')
    if (button) highlight.value?.moveTo(button)
    else highlight.value?.hide()
  }

  /** 指针或焦点离开工具栏时收起高亮块。 */
  function hideHighlight(): void {
    highlight.value?.hide()
  }

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
  const groupMenuRef = ref<InstanceType<typeof DropMenu> | null>(null)
  // 当前打开菜单的折叠箭头与所属工具组；关闭事件先于 select 到达，选择动作不能依赖 openGroup。
  const groupTrigger = shallowRef<HTMLElement | null>(null)
  const groupMenuTarget = shallowRef<ToolDef | null>(null)
  watch(
    () => props.magnetMode,
    (mode) => {
      if (mode !== MagnetMode.Off) lastActiveMagnetMode.value = mode
    },
    { immediate: true },
  )
  const showAlerts = ref(false)

  /** 高亮 id：range 模式优先，否则 kernel tool，否则本地 click 缓存 */
  const highlightToolId = computed(() => {
    if (props.isRangeSelectMode) return RANGE_SELECT_UI_TOOL_ID
    return props.drawingToolId ?? selectedToolId.value
  })

  watch(
    () => props.effectiveSettings,
    (val) => {
      setCanvasProfilerEnabled(!!val?.enableCanvasProfiler)
    },
    { immediate: true },
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

  /** 把工具组转成 DropMenu 分组：选中态与禁用态沿用工具栏规则。 */
  function menuGroups(group: ToolDef): ReadonlyArray<DropMenuGroup> {
    return [
      {
        id: group.id,
        label: group.title,
        items: (group.children ?? []).map((child) => ({
          id: child.id,
          label: child.title,
          icon: child.icon,
          active: isChildActive(group, child),
          disabled: isChildDisabled(group, child),
        })),
      },
    ]
  }

  /** 当前生效项：磁吸看档位，绘图工具看高亮 id，删除组没有选中态。 */
  function isChildActive(group: ToolDef, child: ToolDef): boolean {
    if (group.id === magnetGroup.id) return props.magnetMode === child.id
    if (group.id === deleteGroup.id) return false
    return highlightToolId.value === child.id
  }

  /** 删除组按当前图元/指标是否存在禁用子项。 */
  function isChildDisabled(group: ToolDef, child: ToolDef): boolean {
    if (group.id !== deleteGroup.id) return false
    return child.id === 'drawings' ? !props.hasDrawings : !props.hasIndicators
  }

  function selectTool(tool: ToolDef) {
    if (tool.children?.length) {
      const child = groupTool(tool)
      selectedToolId.value = child.id
      emit('selectTool', child.id)
      return
    }
    selectedToolId.value = tool.id
    emit('selectTool', tool.id)
  }

  /** 在折叠箭头右侧打开工具组菜单；菜单本体复用 DropMenu 的坐标模式。 */
  function openGroupMenu(group: ToolDef, event: MouseEvent): void {
    const trigger = event.currentTarget as HTMLElement
    const bounds = trigger.getBoundingClientRect()
    groupTrigger.value = trigger
    groupMenuTarget.value = group
    openGroupId.value = group.id
    groupMenuRef.value?.openAt(bounds.right + 4, bounds.top)
  }

  /** 菜单选择：动作归属打开菜单的工具组，避免关闭事件先清空 openGroup。 */
  function onGroupMenuSelect(_groupId: string, itemId: string): void {
    const group = groupMenuTarget.value
    if (group) selectChild(group, itemId)
  }

  /** 菜单选择统一收口到子项 id：删除组执行清理，磁吸组写档位，其余切换绘图工具。 */
  function selectChild(group: ToolDef, itemId: string): void {
    const child = group.children?.find((item) => item.id === itemId)
    if (!child) return
    if (group.id === deleteGroup.id) {
      groupSelections.value[group.id] = child.id
      runDelete(child.id)
      return
    }
    if (group.id === magnetGroup.id) {
      // 磁吸子项的 id 就是 MagnetMode 的三个取值。
      setMagnetMode(child.id as MagnetMode)
      return
    }
    selectedToolId.value = child.id
    groupSelections.value[group.id] = child.id
    emit('selectTool', child.id)
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
  }

  /** 点击全局锁定按钮：按当前状态取反，切换全局绘图锁定。 */
  function toggleGlobalDrawingLock() {
    emit('setGlobalDrawingLock', !props.globalDrawingLocked)
  }
</script>

<style scoped>
  .left-toolbar {
    --tool-button-size: 28px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 3px;
    background: var(--klc-color-ui-surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
  }

  .left-toolbar {
    border-radius: 0 0 0 var(--chart-frame-radius, 3px);
    border-top: 1px solid var(--klc-color-ui-border);
    border-right: 0;
    flex: 0 0 52px;
    position: relative;
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

  /* 命令面板固定在工具栏底部；内容溢出时 auto margin 归零，不挤占上方工具。 */
  .left-toolbar__group--bottom {
    margin-top: auto;
  }

  .left-toolbar__divider {
    width: 18px;
    height: 1px;
    background: var(--klc-color-ui-border);
  }

  /* --- 工具按钮 --- */
  .left-toolbar__button {
    position: relative;
    z-index: 1;
    width: var(--tool-button-size);
    height: var(--tool-button-size);
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--klc-radius-xs, 4px);
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }

  /* 悬停底色由滑动高亮块提供，按钮本身只提亮图标，避免两层底色叠加。 */
  .left-toolbar__button:hover,
  .left-toolbar__button:focus-visible {
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
    /* 深色模式使用浅灰选中底和深色图标，跟随系统时按实际明暗模式生效。 */
    background: light-dark(
      color-mix(in srgb, var(--klc-color-ui-accent) 14%, transparent),
      color-mix(in srgb, var(--klc-color-ui-text) 90%, var(--klc-color-ui-surface))
    );
    color: light-dark(var(--klc-color-ui-accent), var(--klc-color-ui-background));
  }

  .left-toolbar__button:focus-visible {
    outline: none;
    border-color: var(--klc-color-ui-muted);
  }

  .tool-icon {
    width: 16px;
    height: 16px;
  }

  /* --- 工具组折叠触发器 --- */
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

  /* --- GitHub 入口的自定义 tooltip 内容 --- */
  .github-tooltip {
    display: block;
    min-width: 176px;
    padding: 2px 0;
    text-align: left;
  }

  .github-tooltip__meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 3px 12px;
    color: color-mix(in srgb, var(--klc-color-tooltip-text) 62%, transparent);
  }

  .github-tooltip__value {
    color: var(--klc-color-tooltip-text);
    font-family: var(--klc-typography-font-family-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  /* 提交时间作为整行居中的说明，与 Commit 哈希保持同一视觉分组。 */
  .github-tooltip__time {
    grid-column: 1 / -1;
    color: color-mix(in srgb, var(--klc-color-tooltip-text) 62%, transparent);
    font-family: var(--klc-typography-font-family-mono);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  /* --- 响应式 --- */
  @media (max-width: 768px), (max-height: 640px) {
    .left-toolbar {
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
