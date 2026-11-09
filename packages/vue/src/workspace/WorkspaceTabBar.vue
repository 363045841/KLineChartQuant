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
    <div class="tab-bar__inner">
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
  import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
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

  const draggingId = ref<string | null>(null)
  // 插入位置只用于画指示线，真实顺序始终由标签数组决定。
  const dropTarget = ref<TabDropTarget | null>(null)
  const bar = useTemplateRef<HTMLElement>('bar')
  const list = useTemplateRef<HTMLElement>('list')
  const titleElement = useTemplateRef<HTMLElement>('titleElement')
  /** 标签没堆到中间时显示窗口标题。 */
  const showTitle = ref(true)
  // 同窗口落点提交后 dragend 仍会触发，用它区分“拖出窗口”。
  let dropped = false

  /** 标题与标签内容之间保留的最小间隔。 */
  const TITLE_GAP = 12

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
    listObserver = new ResizeObserver(updateTitleVisibility)
    listObserver.observe(listEl)
    listEl.addEventListener('scroll', updateTitleVisibility, { passive: true })
    updateTitleVisibility()
  })

  watch(() => props.tabs, updateTitleVisibility, { flush: 'post' })

  /** 只清落点指示线：指针离开标签栏，或落点已被消费时使用。 */
  function clearDropTarget(): void {
    dropTarget.value = null
  }

  /** 结束一次拖拽：解绑整窗监听并复位本窗口的全部拖拽状态。 */
  function endDrag(): void {
    window.removeEventListener('dragover', onWindowDragOver)
    window.removeEventListener('drop', onWindowDrop)
    draggingId.value = null
    dropped = false
    clearDropTarget()
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
    draggingId.value = tabId
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
    if (!draggingId.value) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  /** 落在标签栏之外的 drop 直接开新窗口；栏内的已由标签栏自己处理。 */
  function onWindowDrop(event: DragEvent): void {
    const tabId = draggingId.value
    if (!tabId || dropped) return
    event.preventDefault()
    dropped = true
    if (props.desktop && props.canDetach) emit('detach', tabId)
  }

  // 脱窗后标签会先被移除，dragend 可能不再派发；卸载时兜底复位。
  onBeforeUnmount(() => {
    endDrag()
    listObserver?.disconnect()
    list.value?.removeEventListener('scroll', updateTitleVisibility)
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
    if (!props.desktop && !draggingId.value) return
    event.preventDefault()
    const list = event.currentTarget as HTMLElement
    const next = resolveDropTarget(list, event.clientX)
    if (next?.id === draggingId.value) {
      clearDropTarget()
      return
    }
    const current = dropTarget.value
    if (current?.id === next?.id && current?.placement === next?.placement) return
    dropTarget.value = next
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
    const target = dropTarget.value
    clearDropTarget()
    if (payload.fromWorkspaceId !== props.workspaceId) {
      // 明确接受这次 drop，源窗口据此得到 move，不会重复脱窗。
      if (props.desktop) {
        event.preventDefault()
        emit('adopt', { ...payload, target })
      }
      return
    }
    if (!target || (!props.desktop && draggingId.value !== payload.tabId)) return
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
    height: env(titlebar-area-height, var(--desktop-titlebar-height));
    background: var(--klc-color-ui-background);
    /* 分隔线画在内容区顶边：标题栏高度内会落在系统覆盖层下面而缺一段。 */
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
    height: env(titlebar-area-height, var(--desktop-titlebar-height));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    overflow: hidden;
  }

  /* 8px 栏内边距加 36px 菜单位，中心落在下方 52px 工具栏的中线。 */
  .tab-bar__application-menu {
    width: 36px;
    flex: none;
    display: flex;
    justify-content: center;
  }

  /* 红绿灯固定在左上角；左右对称留位。 */
  /* Web 标签栏属于页面，不预留系统标题栏区域。 */
  .tab-bar--web {
    height: 40px;
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

  .tab-bar--mac .tab-bar__inner {
    padding-inline: 82px;
  }

  /* 圆底由公共标识组件提供；只内联静态 SVG，保持与 README 相同的折线与留白。 */
  .tab-bar__brand {
    pointer-events: none;
  }

  .tab-bar__brand-mark,
  .tab-bar__brand :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .tab-bar__brand :deep(circle) {
    fill: none;
  }

  .tab-bar__brand :deep(path) {
    stroke: currentColor;
  }

  .tab-bar__list {
    display: flex;
    flex: 1;
    /* 标签之间的间距。 */
    gap: 6px;
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
    /* 未选中的标签给一层很浅的底色，让左右两侧都有可见边界，分隔线才落得居中。 */
    padding: 0 8px;
    max-width: 220px;
    height: 26px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    box-sizing: border-box;
    color: var(--klc-color-text-tertiary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .tab-bar__tab:hover,
  .tab-bar__tab:focus-visible {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
    outline: 0;
  }

  .tab-bar__tab.is-active {
    /* 跟随图表设置的实际 color-scheme，自动模式也使用对应的选中背景。 */
    background: light-dark(transparent, var(--klc-color-ui-hover));
    border-color: var(--klc-color-ui-border);
    color: var(--klc-color-ui-text);
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
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    /* 用底色表示实体，不画边框；与未选中标签同一层浅灰。 */
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
    font-weight: 600;
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
