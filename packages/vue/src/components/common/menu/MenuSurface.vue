<!--
  受控菜单面板：只根据 open 渲染，根据 anchor 定位，关闭只发 update:open 交回宿主。
  触发器、坐标来源与状态所有权都不在这里，宿主不给 open 就不会打开。
-->
<template>
  <Teleport :to="teleportTarget">
    <div
      ref="menu"
      class="drop-menu__panel popover-surface popover-surface--scroll klc-overlay"
      :class="{ 'drop-menu__panel--compact': density === 'compact' }"
      v-bind="popover.panelBindings.value"
      role="menu"
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
          @pointerleave="onSubmenuPointerLeave"
          @pointerover="onSubmenuPointerOver"
          @focusin="onSubmenuFocusIn"
          @focusout="hideSubmenuHighlight"
        >
          <SlidingHighlight ref="submenuHighlight" class="drop-menu__submenu-highlight" />
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
  import '@vue-src/components/common/overlay/popover-surface.css'

  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'
  import { startFloatingPosition } from '@vue-src/composables/overlay/floatingPosition.js'
  import { useAnchoredSurface } from '@vue-src/composables/overlay/useAnchoredSurface.js'
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
  import DropMenuItemButton from './DropMenuItemButton.vue'
  import type { DropMenuGroup, DropMenuItem, MenuAnchor } from './dropMenuTypes.js'

  const props = defineProps<{
    /** 是否展开；面板不持有开关状态。 */
    open: boolean
    /** 打开位置：锚点按钮元素，或指针坐标。 */
    anchor: MenuAnchor | null
    label: string
    /** 菜单分组。 */
    groups?: ReadonlyArray<DropMenuGroup>
    message?: string
    /** 分组为空时展示的提示；未提供时不渲染空提示。 */
    emptyText?: string
    /** 菜单项行高；默认松散，短选项列表可使用紧凑模式。 */
    density?: 'compact' | 'loose'
    /** 普通菜单项选中后是否保持打开。 */
    keepOpenOnSelect?: boolean
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

  const groups = computed(() => props.groups ?? [])

  const roving = useRovingFocus(itemsRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })
  const submenuRoving = useRovingFocus(submenuRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })

  const popover = useAnchoredSurface(
    props,
    menuRef,
    () => {
      emit('open')
      // 指针打开的面板只预置 tabindex，避免菜单项常驻 hover 高亮；键盘打开才移入焦点。
      // 优先落到已勾选项：单选项里它就是当前值，键盘继续用方向键即可切换。
      if (props.focusOnOpen) roving.focusFirst(CHECKED_ITEM_SELECTOR)
      else roving.prime(CHECKED_ITEM_SELECTOR)
    },
    () => {
      emit('close')
      emit('update:open', false)
    },
  )

  watch(
    () => props.focusOnOpen,
    (focus) => {
      if (focus && popover.open.value) focusFirst()
    },
    { flush: 'post' },
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
  let submenuPosition: AbortController | undefined
  const openSubmenuItem = computed(() => {
    const group = groups.value.find((group) => group.id === openSubmenuGroupId.value)
    return group?.items.find((item) => item.id === openSubmenuItemId.value) ?? null
  })
  // 图标槽位只在确实有图标或状态点时保留；全部项都没有时整列不占宽度。
  const hasMainIcons = computed(() =>
    groups.value.some((group) =>
      group.items.some((item) => item.icon !== undefined || item.dot !== undefined),
    ),
  )
  const hasSubmenuIcons = computed(() =>
    (openSubmenuItem.value?.children ?? []).some(
      (item) => item.icon !== undefined || item.dot !== undefined,
    ),
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
    submenuPosition?.abort()
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
    submenuPosition?.abort()
    const position = new AbortController()
    submenuPosition = position
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
    const panel = submenuRef.value
    if (position.signal.aborted || !panel) return
    void startFloatingPosition(
      {
        reference: anchor,
        panel,
        placement: 'right',
        align: 'start',
        offset: 2,
        flip: true,
        matchTriggerWidth: false,
        apply: (style) => {
          submenuStyle.value = { ...submenuStyle.value, ...style }
        },
        onError: closeSubmenu,
      },
      position.signal,
    )
    if (focusFirst) submenuRoving.focusFirst()
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
    if (!props.keepOpenOnSelect && item.selection !== 'checkbox') hide(true)
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

  // 二级菜单是独立的 fixed 面板，与主面板不在同一坐标空间，用自己的一块高亮。
  const submenuHighlight = useTemplateRef<InstanceType<typeof SlidingHighlight>>('submenuHighlight')
  const {
    onPointerOver: onSubmenuPointerOver,
    onFocusIn: onSubmenuFocusIn,
    hide: hideSubmenuHighlight,
  } = useSlidingHighlight(submenuHighlight, (target) =>
    target.closest<HTMLElement>('.drop-menu__item'),
  )

  /** 指针离开二级菜单：收起自己的高亮，并沿用既有的容错时间安排关闭。 */
  function onSubmenuPointerLeave(): void {
    hideSubmenuHighlight()
    scheduleSubmenuClose()
  }

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
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (openSubmenuItem.value) closeSubmenuAndFocusParent()
      else hide(true)
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
    if (menuRef.value?.contains(next) || popover.trigger.value?.contains(next)) return
    hide()
  }

  // 窗口尺寸变化时子菜单的 fixed 坐标会失效，直接收起，等下一次 hover/键盘重新测量。
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', closeSubmenu, { passive: true })
  }
  onScopeDispose(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', closeSubmenu)
    closeSubmenu()
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
  .drop-menu__highlight,
  .drop-menu__submenu-highlight {
    /* 菜单项铺满整宽、上下紧邻，沿用直角高亮避免边缘露出面板圆角。 */
    --sliding-highlight-radius: 0;
  }

  /* 条目内容压在悬停高亮块之上。 */
  .drop-menu__item-action {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    /* 与选项文字左侧内边距一致，状态标记的右侧留白不会大于文字的左侧留白。 */
    padding-right: var(--klc-space-8, 8px);
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
</style>
