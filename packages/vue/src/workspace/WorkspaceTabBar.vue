<!--
  窗口标题栏：工作区标识、标签页列表与新建入口。
  标签可拖动换位、拖出成新窗口、拖入本窗口；中键或悬停的关闭按钮可关闭。
-->
<template>
  <header
    ref="bar"
    class="tab-bar"
    :class="{ 'tab-bar--mac': desktop && platform === 'darwin', 'tab-bar--web': !desktop }"
    :style="{ '--tab-accent': accent }"
    @dragover.prevent
    @drop="onDrop"
  >
    <div ref="inner" class="tab-bar__inner">
      <svg
        v-if="outlineWidth > 0"
        class="tab-bar__outline"
        :width="outlineWidth"
        :height="outlineHeight"
        :viewBox="`0 0 ${outlineWidth} ${outlineHeight}`"
        aria-hidden="true"
      >
        <path class="tab-bar__outline-fill" :d="outlineFillPath" />
        <path class="tab-bar__outline-stroke" :d="outlineStrokePath" />
      </svg>
      <div class="tab-bar__application-menu">
        <WorkspaceMenu :accent="accent" :theme-mode="themeMode" @theme-change="emit('theme-change', $event)" />
      </div>
      <div
        class="tab-bar__list"
        ref="list"
        role="tablist"
        aria-label="标签页"
        @dragover="onListDragOver"
        @dragleave="onListDragLeave"
      >
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-bar__tab"
          :class="{
            'is-active': tab.id === activeTabId,
            'is-drop-before': dropTarget?.id === tab.id && dropTarget.placement === 'before',
            'is-drop-after': dropTarget?.id === tab.id && dropTarget.placement === 'after',
          }"
          role="tab"
          tabindex="0"
          :aria-selected="tab.id === activeTabId"
          :data-tab-id="tab.id"
          draggable="true"
          @click="emit('activate', tab.id)"
          @keydown.enter.prevent="emit('activate', tab.id)"
          @keydown.space.prevent="emit('activate', tab.id)"
          @auxclick="onAuxClick($event, tab.id)"
          @dragstart="onDragStart($event, tab.id)"
          @dragend="onDragEnd($event, tab.id)"
        >
          <span class="tab-bar__label">{{ tabLabelForSpec(tab.spec) }}</span>
          <IconX
            v-if="tabs.length > 1"
            class="tab-bar__close"
            role="button"
            tabindex="0"
            :aria-label="`关闭 ${tabLabelForSpec(tab.spec)}`"
            draggable="false"
            @pointerdown.stop
            @click.stop="emit('close', tab.id)"
            @keydown.enter.prevent.stop="emit('close', tab.id)"
            @keydown.space.prevent.stop="emit('close', tab.id)"
          />
        </div>
        <button type="button" class="tab-bar__create" aria-label="新建标签页" @click="emit('create')">
          <IconPlus class="tab-bar__create-icon" aria-hidden="true" />
        </button>
      </div>
      <!-- 标题居中显示；标签延伸到这一区域时自动让位。 -->
      <span
        v-if="title"
        ref="titleElement"
        class="tab-bar__title"
        :class="{ 'is-hidden': !showTitle }"
        aria-hidden="true"
        >{{ title }}</span
      >
      <!-- macOS 用系统红绿灯，其它平台自绘窗口按钮；图标取自 OpenChamber 的经典 Windows 样式。 -->
      <div v-if="desktop && platform !== 'darwin'" class="tab-bar__controls">
        <button type="button" class="tab-bar__control" aria-label="最小化" @click="emit('minimize')">
          <svg class="tab-bar__control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 11V13H19V11H5Z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          class="tab-bar__control"
          :aria-label="maximized ? '还原' : '最大化'"
          @click="emit('toggleMaximize')"
        >
          <svg
            class="tab-bar__control-icon tab-bar__control-icon--maximize"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              v-if="maximized"
              d="M18 7H22V9H16V3H18V7ZM8 9H2V7H6V3H8V9ZM18 17V21H16V15H22V17H18ZM8 15V21H6V17H2V15H8Z"
              fill="currentColor"
            />
            <path
              v-else
              d="M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM5 5V19H19V5H5Z"
              fill="currentColor"
            />
          </svg>
        </button>
        <button
          type="button"
          class="tab-bar__control tab-bar__control--close"
          aria-label="关闭"
          @click="emit('closeWindow')"
        >
          <svg class="tab-bar__control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    useTemplateRef,
    watch,
  } from 'vue'
  import IconPlus from '~icons/tabler/plus'
  import IconX from '~icons/tabler/x'
  import WorkspaceMenu from './components/WorkspaceMenu.vue'
  import { readTabDragPayload, type TabDragPayload } from './impl/tab-drag.js'
  import type { TabDropTarget, TabPlacement } from './impl/workspace-tabs.js'
  import { tabLabelForSpec } from './impl/workspace-tabs.js'
  import type { WorkspaceTab } from './types.js'

  const props = withDefaults(
    defineProps<{
      /** Web 仅支持页面内标签；桌面宿主额外提供窗口操作。 */
      desktop?: boolean
      title?: string
      themeMode?: ChartSettings['theme']
      /** 宿主平台；macOS 需要给系统红绿灯让出位置。 */
      platform?: string
      /** 本窗口的工作区身份，拖拽数据里用它标识标签来源。 */
      workspaceId: string
      tabs: ReadonlyArray<WorkspaceTab>
      activeTabId: string
      /** 工作区标识色，取自色板。 */
      accent: string
      /** 只有一个标签时不允许拖出成新窗口；拖到其它窗口合并仍然允许。 */
      canDetach?: boolean
      /** 当前窗口是否最大化，决定最大化按钮显示还原还是最大化图标。 */
      maximized?: boolean
    }>(),
    { desktop: false, platform: '', title: '', canDetach: false, maximized: false },
  )
  const emit = defineEmits<{
    'theme-change': [mode: ChartSettings['theme']]
    activate: [tabId: string]
    create: []
    close: [tabId: string]
    detach: [tabId: string]
    adopt: [request: { fromWorkspaceId: string; tabId: string; target: TabDropTarget | null }]
    reorder: [tabId: string, targetId: string, placement: TabPlacement]
    minimize: []
    toggleMaximize: []
    closeWindow: []
  }>()

  interface TabDragSession {
    /** 本窗口正在拖的标签；外部拖入时为 null。 */
    readonly tabId: string | null
    readonly target: TabDropTarget | null
  }

  // 拖拽会话同时承载本地来源与落点；外部拖入只有落点，没有 tabId。
  const dragSession = shallowRef<TabDragSession | null>(null)
  // 插入位置只用于画指示线，真实顺序始终由标签数组决定。
  const dropTarget = computed(() => dragSession.value?.target ?? null)
  const bar = useTemplateRef<HTMLElement>('bar')
  const list = useTemplateRef<HTMLElement>('list')
  const titleElement = useTemplateRef<HTMLElement>('titleElement')
  /** 标签没堆到中间时显示窗口标题。 */
  const showTitle = ref(true)
  // 同窗口落点提交后 dragend 仍会触发，用它区分“拖出窗口”。
  let dropped = false

  /** 标题与标签内容之间保留的最小间隔。 */
  const TITLE_GAP = 12

  /** 活动标签轮廓：整条底边线 + 标签轮廓由同一个 SVG 路径绘制，节点不会重叠。 */
  const OUTLINE_FLARE = 8
  const OUTLINE_RADIUS = 6

  interface OutlineGeometry {
    readonly width: number
    readonly height: number
    readonly tabLeft: number
    readonly tabRight: number
    readonly tabTop: number
  }

  const innerEl = useTemplateRef<HTMLElement>('inner')
  /** 轮廓几何一次写入、一次读取；空值表示没有可绘制的活动标签。 */
  const outlineGeometry = shallowRef<OutlineGeometry | null>(null)
  const outlineWidth = computed(() => outlineGeometry.value?.width ?? 0)
  const outlineHeight = computed(() => outlineGeometry.value?.height ?? 0)
  let outlineTarget: HTMLElement | null = null
  let outlineObserver: ResizeObserver | null = null
  let outlineFrame: number | null = null
  const outlineTransitions = new Map<EventTarget, Set<string>>()

  /** 前方标签变窄也会移动活动标签；位置变化不会触发 ResizeObserver。 */
  function trackOutlinePosition(): void {
    outlineFrame = null
    for (const target of outlineTransitions.keys()) {
      if (!(target instanceof Element) || !list.value?.contains(target)) {
        outlineTransitions.delete(target)
      }
    }
    syncOutlineSize()
    if (outlineTransitions.size > 0) {
      outlineFrame = requestAnimationFrame(trackOutlinePosition)
    }
  }

  function onOutlineTransitionRun(event: TransitionEvent): void {
    if (!event.target || !['width', 'margin-left'].includes(event.propertyName)) return
    const properties = outlineTransitions.get(event.target) ?? new Set<string>()
    properties.add(event.propertyName)
    outlineTransitions.set(event.target, properties)
    if (outlineFrame === null) {
      outlineFrame = requestAnimationFrame(trackOutlinePosition)
    }
  }

  function onOutlineTransitionFinish(event: TransitionEvent): void {
    if (!event.target) return
    const properties = outlineTransitions.get(event.target)
    if (!properties?.delete(event.propertyName)) return
    if (properties.size === 0) outlineTransitions.delete(event.target)
    // 结束和中断都读取最终布局；下一帧再次校准后自动停止。
    syncOutlineSize()
  }

  function onListScroll(): void {
    updateTitleVisibility()
    syncOutlineSize()
  }

  function syncOutlineSize(): void {
    const inner = innerEl.value
    const element = outlineTarget
    if (!inner || !element) {
      outlineGeometry.value = null
      return
    }
    const innerRect = inner.getBoundingClientRect()
    const tabRect = element.getBoundingClientRect()
    // SVG 描边不像 CSS 边框那样参与设备像素吸附：测量值要自己落到设备像素网格上，
    // 否则 1px 线会横跨两行被抗锯齿摊开，和 ChartMain 的边框粗细对不上。
    const dpr = window.devicePixelRatio || 1
    const snap = (value: number, origin: number) =>
      Math.round((origin + value) * dpr) / dpr - origin
    outlineGeometry.value = {
      width: snap(innerRect.width, innerRect.left),
      height: snap(innerRect.height, innerRect.top),
      tabLeft: snap(tabRect.left - innerRect.left, innerRect.left),
      tabRight: snap(tabRect.right - innerRect.left, innerRect.left),
      tabTop: snap(tabRect.top - innerRect.top, innerRect.top),
    }
  }

  /** 切换测量目标；自身尺寸由 ResizeObserver 监听，动画位移由逐帧测量同步。 */
  function measureOutline(): void {
    const element =
      list.value?.querySelector<HTMLElement>(`[data-tab-id="${props.activeTabId}"]`) ?? null
    if (element !== outlineTarget) {
      outlineObserver?.disconnect()
      outlineObserver = null
      outlineTarget = element
      if (element) {
        outlineObserver = new ResizeObserver(syncOutlineSize)
        outlineObserver.observe(element)
      }
    }
    syncOutlineSize()
  }

  /** 标签填充：闭合路径延伸至栏底，与下方内容连通。 */
  const outlineFillPath = computed(() => {
    const outline = outlineGeometry.value
    if (!outline) return ''
    const { width, height, tabLeft: left, tabRight: right, tabTop: top } = outline
    if (width <= 0 || height <= 0 || right <= left) return ''
    const flare = OUTLINE_FLARE
    const radius = OUTLINE_RADIUS
    return [
      `M${left + radius} ${top}`,
      `L${right - radius} ${top}`,
      `A${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
      `L${right} ${height - flare}`,
      `A${flare} ${flare} 0 0 0 ${right + flare} ${height}`,
      `L${left - flare} ${height}`,
      `A${flare} ${flare} 0 0 0 ${left} ${height - flare}`,
      `L${left} ${top + radius}`,
      `A${radius} ${radius} 0 0 1 ${left + radius} ${top}`,
      'Z',
    ].join(' ')
  })

  /** 描边同时画整条底边线与标签轮廓，底边在标签两侧连续接入圆弧。 */
  const outlineStrokePath = computed(() => {
    const outline = outlineGeometry.value
    if (!outline) return ''
    const { width, height, tabLeft: left, tabRight: right, tabTop: top } = outline
    if (width <= 0 || height <= 0 || right <= left) return ''
    const flare = OUTLINE_FLARE
    const radius = OUTLINE_RADIUS
    // 1px 描边落在最后一行像素的中线上。
    const line = height - 0.5
    return [
      `M0 ${line}`,
      `L${left - flare} ${line}`,
      `A${flare} ${flare} 0 0 0 ${left} ${line - flare}`,
      `L${left} ${top + radius}`,
      `A${radius} ${radius} 0 0 1 ${left + radius} ${top}`,
      `L${right - radius} ${top}`,
      `A${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
      `L${right} ${line - flare}`,
      `A${flare} ${flare} 0 0 0 ${right + flare} ${line}`,
      `L${width} ${line}`,
    ].join(' ')
  })

  watch(
    () => [props.activeTabId, props.tabs.map((tab) => tab.id)] as const,
    () => {
      void nextTick(measureOutline)
    },
    { flush: 'post' },
  )

  /** 标签内容右边缘越过标题左边缘时隐藏标题，避免文字叠压。 */
  function updateTitleVisibility(): void {
    const listEl = list.value
    const titleEl = titleElement.value
    if (!listEl || !titleEl) return
    const lastChild = listEl.lastElementChild
    if (!lastChild) {
      showTitle.value = true
      return
    }
    const listLeft = listEl.getBoundingClientRect().left
    const titleLeft = titleEl.getBoundingClientRect().left
    // 取标签条最后一个子元素（新建按钮）的右边缘：scrollWidth 至少等于可视宽度，不能用作内容宽度。
    const contentRight = lastChild.getBoundingClientRect().right - listLeft
    showTitle.value = contentRight <= titleLeft - listLeft - TITLE_GAP
  }

  let listObserver: ResizeObserver | undefined

  onMounted(() => {
    const listEl = list.value
    if (!listEl) return
    // 尺寸变化（窗口缩放、字体加载）与标签增减都会改变可用宽度。
    listObserver = new ResizeObserver(() => {
      updateTitleVisibility()
      syncOutlineSize()
    })
    listObserver.observe(listEl)
    listEl.addEventListener('scroll', onListScroll, { passive: true })
    listEl.addEventListener('transitionrun', onOutlineTransitionRun)
    listEl.addEventListener('transitionend', onOutlineTransitionFinish)
    listEl.addEventListener('transitioncancel', onOutlineTransitionFinish)
    updateTitleVisibility()
    void nextTick(measureOutline)
  })

  watch(() => props.tabs, updateTitleVisibility, { flush: 'post' })

  /** 只清落点指示线：指针离开标签栏，或落点已被消费时使用。 */
  function clearDropTarget(): void {
    const session = dragSession.value
    if (!session) return
    dragSession.value = session.tabId === null ? null : { ...session, target: null }
  }

  /** 结束一次拖拽：解绑整窗监听并复位本窗口的全部拖拽状态。 */
  function endDrag(): void {
    window.removeEventListener('dragover', onWindowDragOver)
    window.removeEventListener('drop', onWindowDrop)
    dragSession.value = null
    dropped = false
  }

  /** 中键关闭标签；左键由 click 处理，其它键忽略。 */
  function onAuxClick(event: MouseEvent, tabId: string): void {
    if (event.button !== 1) return
    event.preventDefault()
    if (props.tabs.length === 1) return
    emit('close', tabId)
  }

  function onDragStart(event: DragEvent, tabId: string): void {
    if (!event.dataTransfer) return
    dropped = false
    dragSession.value = { tabId, target: null }
    event.dataTransfer.effectAllowed = 'move'
    const payload: TabDragPayload = { fromWorkspaceId: props.workspaceId, tabId }
    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
    // 拖拽期间整扇窗口都接受这次拖拽：否则指针一离开标签栏就显示禁止光标。
    if (props.desktop) {
      window.addEventListener('dragover', onWindowDragOver)
      window.addEventListener('drop', onWindowDrop)
    }
  }

  /** 拖拽期间接管整窗 dragover，声明为可放置，避免出现禁止光标。 */
  function onWindowDragOver(event: DragEvent): void {
    if (!dragSession.value?.tabId) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  /** 落在标签栏之外的 drop 直接开新窗口；栏内的已由标签栏自己处理。 */
  function onWindowDrop(event: DragEvent): void {
    const tabId = dragSession.value?.tabId
    if (!tabId || dropped) return
    event.preventDefault()
    dropped = true
    if (props.desktop && props.canDetach) emit('detach', tabId)
  }

  // 脱窗后标签会先被移除，dragend 可能不再派发；卸载时兜底复位。
  onBeforeUnmount(() => {
    endDrag()
    listObserver?.disconnect()
    outlineObserver?.disconnect()
    if (outlineFrame !== null) cancelAnimationFrame(outlineFrame)
    outlineTransitions.clear()
    list.value?.removeEventListener('scroll', onListScroll)
    list.value?.removeEventListener('transitionrun', onOutlineTransitionRun)
    list.value?.removeEventListener('transitionend', onOutlineTransitionFinish)
    list.value?.removeEventListener('transitioncancel', onOutlineTransitionFinish)
  })

  /** 按指针横坐标解析插入点：命中标签中线前插前面，越过最后一个插末尾。 */
  function resolveDropTarget(list: HTMLElement, clientX: number): TabDropTarget | null {
    const entries = Array.from(list.querySelectorAll<HTMLElement>('[data-tab-id]')).flatMap(
      (element) => {
        const id = element.dataset.tabId
        return id ? [{ id, rect: element.getBoundingClientRect() }] : []
      },
    )
    for (const { id, rect } of entries) {
      if (clientX < rect.left + rect.width / 2) return { id, placement: 'before' }
    }
    const last = entries.at(-1)
    return last ? { id: last.id, placement: 'after' } : null
  }

  function onListDragOver(event: DragEvent): void {
    // 本窗口和其它窗口拖来的标签用同一套落点计算；dragover 阶段只能读 types。
    if (event.dataTransfer?.types.includes('text/plain') !== true) return
    const session = dragSession.value
    if (!props.desktop && !session?.tabId) return
    event.preventDefault()
    const list = event.currentTarget as HTMLElement
    const next = resolveDropTarget(list, event.clientX)
    if (next?.id === session?.tabId) {
      clearDropTarget()
      return
    }
    const current = session?.target
    if (current?.id === next?.id && current?.placement === next?.placement) return
    dragSession.value = { tabId: session?.tabId ?? null, target: next }
  }

  function onListDragLeave(event: DragEvent): void {
    // 指针移入子元素也会触发 dragleave，只有真正离开列表才清掉指示线。
    const next = event.relatedTarget as Node | null
    if (next && (event.currentTarget as HTMLElement).contains(next)) return
    clearDropTarget()
  }

  /** 拖出标签栏即视为拖出窗口：留在栏内重排，离开栏就另开窗口。 */
  function onDragEnd(event: DragEvent, tabId: string): void {
    const moved = dropped
    endDrag()
    if (moved || !props.desktop || !props.canDetach) return
    // 落到另一个窗口时由对方 accept（dropEffect 变成 move），本窗口不能再判成拖出。
    if (event.dataTransfer?.dropEffect === 'move') return
    const rect = bar.value?.getBoundingClientRect()
    if (!rect) return
    const outsideBar =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    if (outsideBar) emit('detach', tabId)
  }

  /** 落点在同一窗口内换位置，其它窗口拖来的标签则接管。 */
  function onDrop(event: DragEvent): void {
    const raw = event.dataTransfer?.getData('text/plain')
    if (!raw) return
    const payload = readTabDragPayload(raw)
    if (!payload) return
    // 落点先取出再清空：drop 之后本窗口收不到 dragend，指示线必须在这里复位。
    const target = dragSession.value?.target ?? null
    clearDropTarget()
    if (payload.fromWorkspaceId !== props.workspaceId) {
      // 明确接受这次 drop，源窗口据此得到 move，不会重复脱窗。
      if (props.desktop) {
        event.preventDefault()
        emit('adopt', { ...payload, target })
      }
      return
    }
    if (!target || (!props.desktop && dragSession.value?.tabId !== payload.tabId)) return
    event.preventDefault()
    dropped = true
    emit('reorder', payload.tabId, target.id, target.placement)
  }
</script>

<style scoped>
  .tab-bar {
    position: relative;
    flex: none;
    /* 高度以系统给出的覆盖层高度为准：用常量对齐一旦差 1px，画在底部的线就会落进覆盖层。 */
    --tab-bar-height: env(titlebar-area-height, var(--desktop-titlebar-height));
    /* 标签胶囊高度：Tab、新建按钮与应用图标都按这一档高度对齐。 */
    --tab-pill-height: 26px;
    height: var(--tab-bar-height);
    /* 窗口/标签栏与工具栏共用同一表面色，顶部 chrome 连成一体，图表画布保持纯白。 */
    background: var(--klc-color-ui-surround-background);
    -webkit-app-region: drag;
    app-region: drag;
    user-select: none;
  }

  /* 内容收在系统给出的安全区内：Windows / Linux 的原生窗口按钮压在这一层之上。 */
  .tab-bar__inner {
    position: absolute;
    left: env(titlebar-area-x, 0px);
    top: env(titlebar-area-y, 0px);
    width: env(titlebar-area-width, 100%);
    height: var(--tab-bar-height);
    display: flex;
    /* 标签居中，与底部分隔线之间自然留出上下同档的间距。 */
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    /* 分隔线与活动标签轮廓由内部 SVG 一起绘制，这里只负责裁剪溢出。 */
    isolation: isolate;
    overflow: hidden;
  }

  /* 8px 栏内边距加 36px 菜单位，中心落在下方 52px 工具栏的中线。 */
  .tab-bar__application-menu {
    width: 36px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Web 标签栏属于页面，不预留系统标题栏区域。 */
  .tab-bar--web {
    /* 6px 上留白 + 26px 标签 + 6px 到底部分隔线的留白。 */
    --tab-bar-height: 38px;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .tab-bar--web .tab-bar__inner {
    position: relative;
    left: auto;
    top: auto;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }

  /* macOS 为系统红绿灯留位，左右留白对称。 */
  .tab-bar--mac .tab-bar__inner {
    padding-inline: 82px;
  }

  .tab-bar__list {
    display: flex;
    flex: 1;
    /* 撑满栏高，让活动标签可以单独贴底，其余标签仍居中留出间距。 */
    align-self: stretch;
    /* 列表两端保留 8px 内边距，以负外边距维持标签与相邻控件的位置。 */
    padding-inline: 8px;
    margin-inline: -8px;
    /* 标签之间的间距；与底部圆弧同宽，弧线正好接到相邻标签。 */
    gap: 8px;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .tab-bar__list::-webkit-scrollbar {
    display: none;
  }

  .tab-bar__tab {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    padding: 0 8px;
    max-width: 220px;
    height: var(--tab-pill-height);
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    box-sizing: border-box;
    color: var(--klc-color-text-tertiary);
    font-size: 12px;
    cursor: pointer;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .tab-bar__tab:hover:not(.is-active),
  .tab-bar__tab:focus-visible:not(.is-active) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
    outline: 0;
  }

  .tab-bar__tab.is-active {
    /* 活动标签贴住分隔线：轮廓与填充全部由栏内 SVG 路径绘制。 */
    align-self: flex-end;
    /* 26px 胶囊 + 6px 连接段；padding-bottom 把文字顶回 26px 那一档，与非活动标签齐平。 */
    height: calc(var(--tab-pill-height) + 6px);
    padding-bottom: 6px;
    border: 0;
    border-radius: 0;
    color: var(--klc-color-ui-text);
  }

  /* 轮廓覆盖整个标签栏：底边线与活动标签轮廓一次画完。 */
  .tab-bar__outline {
    position: absolute;
    top: 0;
    left: 0;
    z-index: -1;
    pointer-events: none;
    overflow: visible;
  }

  /* 活动标签贴住分隔线：轮廓与填充全部由栏内 SVG 路径绘制。填充取标题栏色，只留 1px 轮廓分界。 */
  .tab-bar__outline-fill {
    fill: var(--klc-color-ui-tab-active-background);
    stroke: none;
  }

  .tab-bar__outline-stroke {
    fill: none;
    stroke: var(--klc-color-ui-border);
    stroke-width: 1;
  }

  /* 插入指示线：贴在标签内边缘，颜色跟随工作区标识。 */
  .tab-bar__tab.is-drop-before {
    box-shadow: inset 2px 0 0 var(--tab-accent);
  }

  .tab-bar__tab.is-drop-after {
    box-shadow: inset -2px 0 0 var(--tab-accent);
  }

  .tab-bar__label {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  /* 关闭图标直接是一个 svg：未选中的标签不占位，选中或悬停时才展开。 */
  .tab-bar__close {
    flex: none;
    width: 0;
    height: 14px;
    margin-left: 0;
    overflow: hidden;
    color: inherit;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition:
      width 120ms ease,
      margin-left 120ms ease,
      opacity 120ms ease;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .tab-bar__tab:hover .tab-bar__close,
  .tab-bar__tab.is-active .tab-bar__close,
  .tab-bar__tab:focus-within .tab-bar__close {
    width: 14px;
    margin-left: 4px;
    opacity: 1;
    pointer-events: auto;
  }

  /* 指针落在关闭图标上时只改图标本身：换成警示色，不加任何底色或外框。 */
  .tab-bar__close:hover,
  .tab-bar__close:focus-visible {
    color: var(--klc-color-ui-danger);
    outline: 0;
  }

  .tab-bar__create {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: var(--tab-pill-height);
    padding: 0;
    border: 0;
    border-radius: 6px;
    /* 默认透明，悬停和键盘聚焦时显示状态底色。 */
    background: transparent;
    color: var(--klc-color-text-tertiary);
    cursor: pointer;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .tab-bar__create:hover,
  .tab-bar__create:focus-visible {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
    outline: 0;
  }

  .tab-bar__create-icon {
    width: 16px;
    height: 16px;
  }

  /* 窗口标题居中；标签延伸到这一区域时隐藏。 */
  .tab-bar__title {
    position: absolute;
    left: 50%;
    top: 50%;
    color: var(--klc-color-text-tertiary);
    font-size: 12px;
    letter-spacing: 0.02em;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .tab-bar__title.is-hidden {
    visibility: hidden;
  }

  /* 自绘窗口按钮：贴住窗口右上角，高度占满标题栏。 */
  .tab-bar__controls {
    display: flex;
    flex: none;
    height: 100%;
    margin-left: -8px;
    margin-right: -8px;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .tab-bar__control {
    display: grid;
    place-items: center;
    width: 44px;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--klc-color-text-tertiary);
    cursor: pointer;
  }

  .tab-bar__control:hover,
  .tab-bar__control:focus-visible {
    /* 与 OpenChamber 一致的半透明叠加底色（约 8% 前景色），不写死灰阶。 */
    background: color-mix(in srgb, var(--klc-color-ui-text) 8%, transparent);
    color: var(--klc-color-ui-text);
    outline: 0;
  }

  .tab-bar__control--close:hover,
  .tab-bar__control--close:focus-visible {
    /* 用错误色背景层 + 错误色文字，而不是整块高饱和红：和冷黑界面一致，也不刺眼。 */
    background: var(--klc-color-ui-danger-background);
    color: var(--klc-color-ui-danger-text);
  }

  .tab-bar__control-icon {
    width: 16px;
    height: 16px;
  }

  /* 最大化/还原图标也保持 14px，视觉重量与 Windows 原生按钮一致。 */
  .tab-bar__control-icon--maximize {
    width: 14px;
    height: 14px;
  }
</style>
