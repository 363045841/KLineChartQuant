<!--
  受控菜单面板：只根据 open 渲染，根据 anchor 定位，关闭只发 update:open 交回宿主。
  触发器、坐标来源与状态所有权都不在这里，宿主不给 open 就不会打开。
-->
<template>
  <Teleport :to="teleportTarget">
    <div
      ref="menu"
      class="drop-menu__panel popover-surface popover-surface--scroll"
      :class="{ 'drop-menu__panel--compact': density === 'compact' }"
      v-bind="popover.panelBindings.value"
      :style="surfaceStyle"
      :role="bodyMode ? 'dialog' : 'menu'"
      :aria-label="label"
      @keydown="onMenuKeydown"
      @focusout="onMenuFocusOut"
      @focusin="onMenuFocusIn"
      @pointerover="onMenuPointerOver"
      @pointerleave="hideHighlight"
      @scroll.passive="closeSubmenu"
    >
      <template v-if="open">
        <div ref="items" class="drop-menu__items">
          <SlidingHighlight ref="highlight" class="drop-menu__highlight" />
          <div v-if="bodyMode" class="drop-menu__body">
            <slot name="body" />
          </div>
          <template v-else>
            <div v-if="$slots.header" class="drop-menu__header">
              <slot name="header" />
            </div>
            <div
              v-for="group in groups"
              :key="group.id"
              class="drop-menu__group"
              :class="{ 'drop-menu__group--titled': group.label }"
            >
              <div v-if="group.label" class="drop-menu__heading">{{ group.label }}</div>
              <div
                v-for="item in group.items"
                :key="item.id"
                class="drop-menu__item"
                :data-group-id="group.id"
                :data-item-id="item.id"
                @pointerenter="onItemPointerEnter(item, $event)"
                @pointerleave="onItemPointerLeave"
              >
                <slot
                  name="item"
                  :group="group"
                  :item="item"
                  :select="() => activateItem(group.id, item)"
                >
                  <DropMenuItemButton
                    :item="item"
                    :show-icon="hasMainIcons"
                    :expanded="item.children?.length ? isSubmenuOpen(item) : undefined"
                    @activate="activateItem(group.id, item)"
                  />
                </slot>
                <span v-if="$slots['item-action']" class="drop-menu__item-action">
                  <slot name="item-action" :group="group" :item="item" />
                </span>
              </div>
              <div v-if="group.items.length === 0 && emptyText" class="drop-menu__empty">
                {{ emptyText }}
              </div>
            </div>
            <div v-if="message" class="drop-menu__message" role="alert">{{ message }}</div>
            <div v-if="$slots.footer" class="drop-menu__footer">
              <slot name="footer" />
            </div>
          </template>
        </div>
        <div
          v-if="openSubmenuItem"
          ref="submenu"
          class="drop-menu__submenu popover-surface"
          :style="submenuStyle"
          role="menu"
          :aria-label="openSubmenuItem.label"
          @keydown="onSubmenuKeydown"
          @pointerenter="cancelSubmenuClose"
          @pointerleave="scheduleSubmenuClose"
        >
          <div
            v-for="child in openSubmenuItem.children"
            :key="child.id"
            class="drop-menu__item"
          >
            <DropMenuItemButton
              :item="child"
              :show-icon="hasSubmenuIcons"
              @activate="selectSubmenuItem(openSubmenuGroupId, openSubmenuItem, child)"
            />
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import './popover-surface.css'

  import { useAnchoredPopover } from '@vue-src/composables/overlay/useAnchoredPopover.js'
  import { useRovingFocus } from '@vue-src/composables/overlay/useRovingFocus.js'
  import { useFullscreenTeleportTarget } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import { useSlidingHighlight } from '@vue-src/composables/ui/useSlidingHighlight.js'
  import {
    type CSSProperties,
    computed,
    nextTick,
    onScopeDispose,
    shallowRef,
    useTemplateRef,
    watch,
  } from 'vue'
  import type { DropMenuGroup, DropMenuItem, MenuAnchor } from './dropMenuTypes.js'
  import DropMenuItemButton from './DropMenuItemButton.vue'
  import SlidingHighlight from './SlidingHighlight.vue'

  const props = defineProps<{
    /** 是否展开；面板不持有开关状态。 */
    open: boolean
    /** 打开位置：锚点按钮元素，或指针坐标。 */
    anchor: MenuAnchor | null
    label: string
    /** 分组列表；body 模式不需要分组内容，可省略。 */
    groups?: ReadonlyArray<DropMenuGroup>
    message?: string
    /** 分组为空时展示的提示；未提供时不渲染空提示。 */
    emptyText?: string
    /** 菜单项行高；默认松散，短选项列表可使用紧凑模式。 */
    density?: 'compact' | 'loose'
    /** 菜单项选中后是否保持打开；body 模式（表单/预览）默认保持。 */
    keepOpenOnSelect?: boolean
    /** 用 body 插槽替换默认分组内容，供表单、预览等自定义面板使用。 */
    bodyMode?: boolean
    /** 相对锚点的弹出方向。 */
    placement?: 'auto' | 'top' | 'bottom'
    /** 面板与锚点的间距；坐标锚点默认贴住指针，元素锚点默认 4px。 */
    offset?: number
    /** 关闭后归还焦点的元素；默认归还给元素锚点，坐标锚点不归还。 */
    restoreFocusTo?: HTMLElement | null
    /** 打开后把焦点移入首个可用项；指针打开的面板保持 false。 */
    focusOnOpen?: boolean
  }>()

  const emit = defineEmits<{
    select: [groupId: string, itemId: string, parentId?: string]
    open: []
    close: []
    'update:open': [open: boolean]
  }>()

  /** 键盘首选落点：已勾选的单选项；没有勾选时 roving 会退回首项。 */
  const CHECKED_ITEM_SELECTOR = '[aria-checked="true"]'

  const menuRef = useTemplateRef<HTMLElement>('menu')
  const itemsRef = useTemplateRef<HTMLElement>('items')
  const submenuRef = useTemplateRef<HTMLElement>('submenu')
  const teleportTarget = useFullscreenTeleportTarget()

  /** 分组是 body 模式的可选项：缺省为空数组，模板与派生逻辑共用同一份。 */
  const groups = computed(() => props.groups ?? [])
  /** 元素锚点交给 popover 的锚点位置；坐标锚点走原点矩形。 */
  const anchorElement = computed(() =>
    props.anchor?.kind === 'element' ? props.anchor.element : null,
  )
  /** 面板圆角只写变量，默认值仍归 popover-surface.css；二级菜单是面板子节点，自动继承。 */
  const surfaceRadius = shallowRef<string | null>(null)
  const surfaceStyle = computed<CSSProperties | undefined>(() =>
    surfaceRadius.value === null ? undefined : { '--popover-surface-radius': surfaceRadius.value },
  )

  /** 读锚点元素的 computed 圆角；0 圆角是贴边单元格的写法，沿用表面默认值。 */
  function readAnchorRadius(): string | null {
    const element = anchorElement.value
    if (!element) return null
    const radius = getComputedStyle(element).borderRadius
    return radius === '' || radius === '0px' ? null : radius
  }
  const origin = computed(() => {
    const anchor = props.anchor
    if (anchor?.kind !== 'point') return null
    return { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height }
  })

  const roving = useRovingFocus(itemsRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })
  const submenuRoving = useRovingFocus(submenuRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })

  const popover = useAnchoredPopover({
    trigger: anchorElement,
    panel: menuRef,
    origin,
    restoreFocusTo: () => props.restoreFocusTo ?? anchorElement.value,
    placement: () => props.placement ?? 'auto',
    offset: props.offset ?? (props.anchor?.kind === 'point' ? 0 : 4),
    maxHeight: () => 'min(420px, calc(100vh - 24px))',
    onOpen: () => {
      // 面板是触发器的延伸：圆角只从触发按钮读，宿主无需再传一份。
      surfaceRadius.value = readAnchorRadius()
      emit('open')
      // 指针打开的面板只预置 tabindex，避免菜单项常驻 hover 高亮；键盘打开才移入焦点。
      // 优先落到已勾选项：单选项里它就是当前值，键盘继续用方向键即可切换。
      if (props.focusOnOpen) roving.focusFirst(CHECKED_ITEM_SELECTOR)
      else roving.prime(CHECKED_ITEM_SELECTOR)
    },
    onClose: () => {
      emit('close')
      emit('update:open', false)
    },
  })

  // 宿主开关是唯一入口：open 变 true 就展开，变 false 就收起并把焦点还给宿主指定的元素。
  watch(
    () => props.open,
    (next) => {
      if (next) popover.show()
      else popover.hide()
    },
    { flush: 'post', immediate: true },
  )

  /** 关闭面板；restoreFocus 为真时焦点回到宿主指定的元素。 */
  function hide(restoreFocus = false): void {
    closeSubmenu()
    popover.hide({ restoreFocus })
  }

  // 整个面板共用一块悬停高亮：移动时只改位置和高度，形成滑动过渡而不是淡入淡出。
  const highlight = useTemplateRef<InstanceType<typeof SlidingHighlight>>('highlight')
  const SUBMENU_HOVER_DELAY = 120
  const SUBMENU_CLOSE_DELAY = 160
  let submenuTimer: ReturnType<typeof setTimeout> | undefined

  // 同一时间只展开一个二级菜单；只保存 id，子项内容始终从最新的 groups 派生。
  const openSubmenuItemId = shallowRef<string | null>(null)
  const openSubmenuGroupId = shallowRef<string | null>(null)
  const submenuAnchor = shallowRef<HTMLElement | null>(null)
  const submenuStyle = shallowRef<CSSProperties>({ display: 'none' })
  const openSubmenuItem = computed(() => {
    const group = groups.value.find((group) => group.id === openSubmenuGroupId.value)
    return group?.items.find((item) => item.id === openSubmenuItemId.value) ?? null
  })
  // 图标槽位只在确实有图标时保留；全部项都没有图标时整列不占宽度。
  const hasMainIcons = computed(() =>
    groups.value.some((group) => group.items.some((item) => item.icon !== undefined)),
  )
  const hasSubmenuIcons = computed(() =>
    (openSubmenuItem.value?.children ?? []).some((item) => item.icon !== undefined),
  )

  /** 延迟展开二级菜单，避免指针快速划过时连环弹出。 */
  function onItemPointerEnter(item: DropMenuItem, event: PointerEvent): void {
    const anchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    if (!anchor) return
    if (!item.children?.length) {
      if (openSubmenuItemId.value !== null) scheduleSubmenuClose()
      return
    }
    cancelSubmenuClose()
    if (openSubmenuItemId.value === item.id) return
    submenuTimer = setTimeout(() => {
      void showSubmenu(item, anchor, false)
    }, SUBMENU_HOVER_DELAY)
  }

  function onItemPointerLeave(): void {
    if (openSubmenuItemId.value !== null) scheduleSubmenuClose()
  }

  /** 指针在主菜单项与子菜单之间移动时留出容错时间，不立即收起。 */
  function scheduleSubmenuClose(): void {
    cancelSubmenuClose()
    submenuTimer = setTimeout(closeSubmenu, SUBMENU_CLOSE_DELAY)
  }

  function cancelSubmenuClose(): void {
    if (submenuTimer === undefined) return
    clearTimeout(submenuTimer)
    submenuTimer = undefined
  }

  function closeSubmenu(): void {
    cancelSubmenuClose()
    openSubmenuItemId.value = null
    openSubmenuGroupId.value = null
    submenuAnchor.value = null
    submenuStyle.value = { display: 'none' }
  }

  function isSubmenuOpen(item: DropMenuItem): boolean {
    return openSubmenuItemId.value === item.id
  }

  /** 展开二级菜单；先贴到父项右侧，再测量并按空间翻转。 */
  async function showSubmenu(
    item: DropMenuItem,
    anchor: HTMLElement,
    focusFirst: boolean,
  ): Promise<void> {
    cancelSubmenuClose()
    openSubmenuItemId.value = item.id
    openSubmenuGroupId.value =
      anchor.dataset.groupId ?? groups.value.find((group) => group.items.includes(item))?.id ?? null
    submenuAnchor.value = anchor
    const anchorRect = anchor.getBoundingClientRect()
    submenuStyle.value = {
      display: 'block',
      position: 'fixed',
      left: `${anchorRect.right + 2}px`,
      top: `${anchorRect.top}px`,
    }
    await nextTick()
    if (openSubmenuItemId.value !== item.id) return
    positionSubmenu()
    if (focusFirst) submenuRoving.focusFirst()
  }

  function positionSubmenu(): void {
    const panel = submenuRef.value
    const anchor = submenuAnchor.value
    if (!panel || !anchor) return
    const anchorRect = anchor.getBoundingClientRect()
    const size = panel.getBoundingClientRect()
    const gap = 2
    const padding = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    let left = anchorRect.right + gap
    if (left + size.width > viewportWidth - padding) {
      left = anchorRect.left - size.width - gap
    }
    left = Math.max(padding, Math.min(left, viewportWidth - size.width - padding))
    let top = anchorRect.top
    if (top + size.height > viewportHeight - padding) {
      top = viewportHeight - size.height - padding
    }
    top = Math.max(padding, top)
    submenuStyle.value = {
      display: 'block',
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      maxHeight: `calc(100vh - ${padding * 2}px)`,
      zIndex: 'var(--klc-z-index-popover, 1010)',
    }
  }

  function findItemElement(groupId: string, itemId: string): HTMLElement | null {
    const items = itemsRef.value?.querySelectorAll<HTMLElement>('.drop-menu__item') ?? []
    return (
      [...items].find(
        (element) => element.dataset.groupId === groupId && element.dataset.itemId === itemId,
      ) ?? null
    )
  }

  /** 主菜单项激活：有子菜单只展开，不触发选择。 */
  function activateItem(groupId: string, item: DropMenuItem): void {
    if (item.disabled) return
    if (item.children?.length) {
      const anchor = findItemElement(groupId, item.id)
      if (anchor) void showSubmenu(item, anchor, true)
      return
    }
    activateLeaf(groupId, item)
  }

  /**
   * 叶子项激活：开关切换后保持菜单打开，单选与命令按 keepOpenOnSelect 决定是否关闭。
   *
   * @param groupId 所属分组
   * @param item 被激活的项
   * @param parentId 来自二级菜单时的父项 id
   */
  function activateLeaf(groupId: string, item: DropMenuItem, parentId?: string): void {
    // body 模式（表单、预览）选中后必须保持打开，否则正在编辑的内容会被关掉。
    if (!(props.keepOpenOnSelect ?? props.bodyMode) && item.selection !== 'checkbox') hide(true)
    // 二级菜单的父项 id 只在存在时下发，调用方按参数个数区分顶层与子项。
    if (parentId === undefined) emit('select', groupId, item.id)
    else emit('select', groupId, item.id, parentId)
  }

  function selectSubmenuItem(
    groupId: string | null,
    parent: DropMenuItem | null,
    child: DropMenuItem,
  ): void {
    if (child.disabled || groupId === null || parent === null) return
    activateLeaf(groupId, child, parent.id)
  }

  function closeSubmenuAndFocusParent(): void {
    const anchor = submenuAnchor.value
    const focusTarget = anchor?.querySelector<HTMLElement>('.drop-menu__item-main') ?? anchor
    closeSubmenu()
    focusTarget?.focus()
  }

  // 面板级委托：指针与焦点在菜单项之间滑动；二级菜单和空白处收起高亮。
  const {
    onPointerOver: onMenuPointerOver,
    onFocusIn: onMenuFocusIn,
    hide: hideHighlight,
  } = useSlidingHighlight(highlight, (target) =>
    submenuRef.value?.contains(target) ? null : target.closest<HTMLElement>('.drop-menu__item'),
  )

  // 关闭后清空高亮与子菜单，重新打开不会残留上一项的位置。
  watch(
    () => props.open,
    (next) => {
      if (next) return
      hideHighlight()
      closeSubmenu()
    },
  )

  function onMenuKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    // 子菜单自己处理方向键与返回；事件冒泡到面板时不再走主列表的 roving。
    if (target && submenuRef.value?.contains(target)) return
    // 行内输入框（如命名表单）保留方向键与字符输入。
    if (target?.matches('input, textarea, select, [contenteditable]')) return
    if (event.key === 'Escape' && openSubmenuItem.value) {
      event.preventDefault()
      event.stopPropagation()
      closeSubmenuAndFocusParent()
      return
    }
    if (event.key === 'ArrowRight') {
      const row = target?.closest<HTMLElement>('.drop-menu__item')
      const groupId = row?.dataset.groupId
      const itemId = row?.dataset.itemId
      const item =
        groupId === undefined || itemId === undefined
          ? undefined
          : groups.value
              .find((group) => group.id === groupId)
              ?.items.find((entry) => entry.id === itemId)
      if (row && item?.children?.length) {
        event.preventDefault()
        void showSubmenu(item, row, true)
        return
      }
    }
    if (roving.onKeydown(event) && openSubmenuItemId.value !== null) closeSubmenu()
  }

  /** 子菜单键盘：← / Esc 回到父项，↑↓ 在子项之间移动。 */
  function onSubmenuKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    if (target?.matches('input, textarea, select, [contenteditable]')) return
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeSubmenuAndFocusParent()
      return
    }
    if (submenuRoving.onKeydown(event)) event.stopPropagation()
  }

  /** 焦点离开面板（Tab 出去或点击别处）时请求关闭。 */
  function onMenuFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null
    if (!next) return
    if (menuRef.value?.contains(next) || anchorElement.value?.contains(next)) return
    hide()
  }

  // 窗口尺寸变化时子菜单的 fixed 坐标会失效，直接收起，等下一次 hover/键盘重新测量。
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', closeSubmenu, { passive: true })
  }
  onScopeDispose(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', closeSubmenu)
    cancelSubmenuClose()
  })

  /** 把焦点交给首选可用项：优先已勾选项，没有勾选就落到首项。 */
  function focusFirst(): void {
    roving.focusFirst(CHECKED_ITEM_SELECTOR)
  }

  defineExpose({ element: menuRef, focusFirst })
</script>

<style scoped>
  .drop-menu__panel {
    box-sizing: border-box;
    width: max-content;
    min-width: 150px;
    max-width: calc(100vw - 16px);
    max-height: min(420px, calc(100vh - 24px));
    padding: 0;
  }

  .drop-menu__panel:empty {
    min-width: 0;
  }

  /*
   * 一个分组边界只有一条线：带标题的分组由标题两侧的线承担分隔，无标题的分组才画普通横线。
   * 两种形态互斥，避免同一个边界被两套规则各画一次。
   */
  .drop-menu__group + .drop-menu__group:not(.drop-menu__group--titled) {
    position: relative;
  }

  /* 横线内缩与菜单项文字、标题两侧的线对齐，不顶到面板圆角。 */
  .drop-menu__group + .drop-menu__group:not(.drop-menu__group--titled)::before {
    position: absolute;
    top: 0;
    right: var(--klc-space-12, 12px);
    left: var(--klc-space-12, 12px);
    border-top: 1px solid var(--klc-color-ui-border);
    content: '';
  }

  /* 面板头部与分组标题同样留白；空插槽不占高度。 */
  .drop-menu__header {
    padding: var(--klc-space-4, 4px) var(--klc-space-8, 8px) 0;
  }

  .drop-menu__footer {
    padding: var(--klc-space-8, 8px);
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .drop-menu__item-action:empty {
    display: none;
  }

  /* 分组标题居中对齐，两侧各一条延伸到面板边缘的线；这条线就是带标题分组的分隔。 */
  .drop-menu__heading {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px) var(--klc-space-4, 4px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-11-font-size, 11px);
    font-weight: 500;
    line-height: 16px;
    text-align: center;
  }

  .drop-menu__heading::before,
  .drop-menu__heading::after {
    flex: 1;
    height: 1px;
    background: var(--klc-color-ui-border);
    content: '';
  }

  .drop-menu__empty {
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .drop-menu__message {
    padding: var(--klc-space-8, 8px) var(--klc-space-8, 8px);
    color: var(--klc-color-ui-danger-text);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .drop-menu__item {
    display: flex;
    align-items: center;
    padding: 0;
    border-radius: 0;
  }

  /* 悬停高亮块的位置、尺寸与过渡由 SlidingHighlight 统一提供。 */
  .drop-menu__highlight {
    /* 菜单项铺满整宽、上下紧邻，沿用直角高亮避免边缘露出面板圆角。 */
    --sliding-highlight-radius: 0;
  }

  /* 条目内容压在悬停高亮块之上。 */
  .drop-menu__item :deep(.drop-menu__item-main),
  .drop-menu__item :deep(.drop-menu__item-action) {
    position: relative;
    z-index: 1;
  }

  /* item 插槽可用同一 class 复用默认按钮样式。 */
  .drop-menu__item :deep(.drop-menu__item-main) {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    flex: 1;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    min-height: 36px;
    padding: var(--drop-menu-item-padding-block, 8px) var(--klc-space-12, 12px);
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: var(--klc-text-12-font-size, 12px);
    font-weight: 400;
    line-height: 20px;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .drop-menu__panel--compact .drop-menu__item :deep(.drop-menu__item-main) {
    min-height: 28px;
    padding-top: var(--drop-menu-item-padding-block, 4px);
    padding-bottom: var(--drop-menu-item-padding-block, 4px);
  }

  /* 图标槽固定占位：条目没有图标时也保留同一宽度，避免文案左右跳动。 */
  .drop-menu__item :deep(.drop-menu__icon) {
    display: inline-flex;
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    align-items: center;
    justify-content: center;
  }

  /* 图标尺寸固定，避免条目之间文字基线跳动；提亮与放大反馈由 .klc-motion-icon-feedback 统一提供。 */
  .drop-menu__item :deep(.drop-menu__item-main svg) {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  /* 快捷键右对齐并弱化，避免和菜单项文案争夺视觉重量。 */
  .drop-menu__item :deep(.drop-menu__shortcut) {
    flex: 0 0 auto;
    margin-left: auto;
    padding-left: var(--klc-space-16, 16px);
    color: var(--klc-color-ui-text-soft);
    font-size: var(--klc-text-12-font-size, 12px);
    font-variant-numeric: tabular-nums;
  }

  .drop-menu__item-action {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    /* 与选项文字左侧内边距一致，状态标记的右侧留白不会大于文字的左侧留白。 */
    padding-right: var(--klc-space-8, 8px);
  }

  .drop-menu__item:hover .drop-menu__item-action :deep(button),
  .drop-menu__item:focus-within .drop-menu__item-action :deep(button) {
    visibility: visible;
  }

  .drop-menu__item-action :deep(button) {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--klc-radius-xs, 4px);
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    visibility: hidden;
  }

  /* 状态标记始终可见，管理按钮仅在悬停或聚焦时出现。 */
  .drop-menu__item-action :deep(.drop-menu__status) {
    display: grid;
    place-items: center;
    /* 宽度贴合图标，避免居中留白叠加后勾选标记右侧间距大于文字左侧。 */
    width: 14px;
    height: 26px;
    color: var(--klc-color-ui-text);
  }

  .drop-menu__item-action :deep(button:hover),
  .drop-menu__item-action :deep(button:focus-visible) {
    color: var(--klc-color-ui-text);
  }

  .drop-menu__item-action :deep(.drop-menu__action--danger:hover),
  .drop-menu__item-action :deep(.drop-menu__action--danger:focus-visible) {
    color: var(--klc-color-ui-danger-text);
  }

  .drop-menu__item-action :deep(button:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  /* 保存成功后的勾选态：保持实色，不随禁用态变淡。 */
  .drop-menu__item-action :deep(button.drop-menu__action--success:disabled) {
    color: var(--klc-color-ui-success);
    opacity: 1;
  }

  .drop-menu__item-action :deep(svg) {
    width: 14px;
    height: 14px;
  }

  .drop-menu__item :deep(.drop-menu__item-main:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  .drop-menu__item :deep(.drop-menu__switch) {
    margin-left: auto;
    width: 28px;
    height: 16px;
    padding: var(--klc-space-2, 2px);
    box-sizing: border-box;
    border-radius: var(--klc-radius-full, 9999px);
    background: var(--klc-color-ui-muted);
  }

  .drop-menu__item :deep(.drop-menu__switch[aria-checked='true']) {
    background: var(--klc-color-ui-accent);
  }

  .drop-menu__item :deep(.drop-menu__switch span) {
    display: block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--klc-color-ui-surface);
    transition: transform var(--klc-motion-dur-base);
  }

  .drop-menu__item :deep(.drop-menu__switch[aria-checked='true'] span) {
    transform: translateX(12px);
  }

  /* 二级菜单与主面板共用表面，但用 fixed 坐标逃出主面板的滚动裁剪。 */
  .drop-menu__submenu {
    box-sizing: border-box;
    width: max-content;
    min-width: 160px;
    max-width: calc(100vw - 16px);
    padding: 0;
    overflow-y: auto;
    opacity: 1;
    transition: opacity var(--klc-motion-dur-slow, 260ms) var(--klc-motion-ease-out, ease-out);
  }

  /* 首次插入时从透明开始，位置已经贴好，只做淡入。 */
  @starting-style {
    .drop-menu__submenu {
      opacity: 0;
    }
  }

  .drop-menu__submenu .drop-menu__item:hover,
  .drop-menu__submenu .drop-menu__item:focus-within {
    background: var(--klc-color-ui-hover);
  }

  .drop-menu__item :deep(.drop-menu__submenu-arrow) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    margin-left: var(--klc-space-4, 4px);
    color: var(--klc-color-ui-text-soft);
  }

  .drop-menu__item :deep(.drop-menu__check) {
    display: inline-flex;
    flex: 0 0 14px;
    align-items: center;
    justify-content: center;
    width: 14px;
    margin-left: auto;
    padding-left: var(--klc-space-8, 8px);
    box-sizing: content-box;
    color: var(--klc-color-ui-text);
  }
</style>
