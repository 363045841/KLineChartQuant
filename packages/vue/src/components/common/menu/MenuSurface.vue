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
      :role="semantics ?? 'menu'"
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
                @pointerenter="onItemPointerEnter(group.id, item, $event)"
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
                    :semantics="semantics"
                    :show-icon="hasMainIcons"
                    :show-check="false"
                    :expanded="item.children?.length ? isSubmenuOpen(group.id, item) : undefined"
                    @activate="activateItem(group.id, item)"
                  />
                </slot>
                <span class="drop-menu__item-trailing">
                  <span class="drop-menu__item-state">
                    <DropMenuCheck :checked="item.checked" />
                    <slot name="item-status" :group="group" :item="item" />
                  </span>
                  <span class="drop-menu__item-action">
                    <slot name="item-action" :group="group" :item="item" />
                  </span>
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
              @activate="selectSubmenuItem(child)"
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
  import DropMenuCheck from './DropMenuCheck.vue'
  import DropMenuItemButton from './DropMenuItemButton.vue'
  import type {
    DropMenuGroup,
    DropMenuItem,
    MenuAnchor,
    MenuPopupSemantics,
  } from './dropMenuTypes.js'

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
    /** 面板语义：纯菜单项用 menu；含行内按钮或输入时用 dialog。 */
    semantics?: MenuPopupSemantics
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
      applyInitialFocus()
    },
    () => {
      emit('close')
      emit('update:open', false)
    },
  )

  watch(
    () => props.focusOnOpen,
    (focus) => {
      if (focus && popover.open.value) applyInitialFocus()
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

  /** 当前展开的子菜单；只存身份与焦点目标，子项内容仍从最新 groups 派生。 */
  interface OpenSubmenu {
    readonly groupId: string
    readonly itemId: string
    readonly focusTarget: HTMLElement
  }

  const HIDDEN_SUBMENU_STYLE: CSSProperties = { display: 'none' }
  const openSubmenu = shallowRef<OpenSubmenu | null>(null)
  const submenuStyle = shallowRef<CSSProperties>(HIDDEN_SUBMENU_STYLE)
  let submenuPosition: AbortController | undefined
  const openSubmenuItem = computed(() => {
    const state = openSubmenu.value
    if (!state) return null
    return (
      groups.value
        .find((group) => group.id === state.groupId)
        ?.items.find((item) => item.id === state.itemId) ?? null
    )
  })

  /** 图标槽位只在确实有图标或状态点时保留；全部项都没有时整列不占宽度。 */
  function itemsHaveIcons(items: readonly DropMenuItem[]): boolean {
    return items.some((item) => item.icon !== undefined || item.dot !== undefined)
  }

  const hasMainIcons = computed(() =>
    groups.value.some((group) => itemsHaveIcons(group.items)),
  )
  const hasSubmenuIcons = computed(() => itemsHaveIcons(openSubmenuItem.value?.children ?? []))

  /** 延迟展开二级菜单，避免指针快速划过时连环弹出。 */
  function onItemPointerEnter(
    groupId: string,
    item: DropMenuItem,
    event: PointerEvent,
  ): void {
    const anchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    if (!anchor) return
    if (!item.children?.length) {
      if (openSubmenu.value) scheduleSubmenuClose()
      return
    }
    cancelSubmenuClose()
    if (isSubmenuOpen(groupId, item)) return
    submenuTimer = setTimeout(() => {
      void showSubmenu(groupId, item, anchor, false)
    }, SUBMENU_HOVER_DELAY)
  }

  function onItemPointerLeave(): void {
    if (openSubmenu.value) scheduleSubmenuClose()
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
    submenuPosition = undefined
    openSubmenu.value = null
    submenuStyle.value = HIDDEN_SUBMENU_STYLE
  }

  /** 子菜单展开态必须同时匹配 group 与 item，避免不同 group 复用 id 时误判。 */
  function isSubmenuOpen(groupId: string, item: DropMenuItem): boolean {
    const state = openSubmenu.value
    return state?.groupId === groupId && state.itemId === item.id
  }

  /** 展开二级菜单；先贴到父项右侧，再测量并按空间翻转。 */
  async function showSubmenu(
    groupId: string,
    item: DropMenuItem,
    anchor: HTMLElement,
    focusFirst: boolean,
  ): Promise<void> {
    cancelSubmenuClose()
    submenuPosition?.abort()
    const position = new AbortController()
    submenuPosition = position
    // 焦点回到父项时不再回头查 DOM，打开时把可聚焦元素一起存进状态。
    const focusTarget = anchor.querySelector<HTMLElement>('.drop-menu__item-main') ?? anchor
    openSubmenu.value = { groupId, itemId: item.id, focusTarget }
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
      if (anchor) void showSubmenu(groupId, item, anchor, true)
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

  function selectSubmenuItem(child: DropMenuItem): void {
    const state = openSubmenu.value
    if (child.disabled || !state) return
    activateLeaf(state.groupId, child, state.itemId)
  }

  function closeSubmenuAndFocusParent(): void {
    const target = openSubmenu.value?.focusTarget
    closeSubmenu()
    target?.focus()
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

  /** 键盘入口只做分派；dialog、菜单、子菜单和输入框各自处理。 */
  function onMenuKeydown(event: KeyboardEvent): void {
    if (props.semantics === 'dialog') {
      handleDialogKeydown(event)
      return
    }
    const target = event.target as HTMLElement | null
    // 子菜单自己处理方向键与返回；事件冒泡到面板时不再走主列表的 roving。
    if (isInsideSubmenu(target) || isEditableTarget(target)) return
    if (handleEscape(event)) return
    if (tryOpenSubmenuFromKeyboard(event, target)) return
    if (roving.onKeydown(event) && openSubmenu.value) closeSubmenu()
  }

  /** dialog 模式只保留 Esc：Tab、Enter、Space 交还原生控件，面板不做 roving。 */
  function handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    hide(true)
  }

  /** 行内输入框（如命名表单）保留方向键与字符输入。 */
  function isEditableTarget(target: HTMLElement | null): boolean {
    return target?.matches('input, textarea, select, [contenteditable]') ?? false
  }

  function isInsideSubmenu(target: HTMLElement | null): boolean {
    return target !== null && submenuRef.value?.contains(target) === true
  }

  /** Esc：子菜单打开时回到父项，否则关闭整个面板。 */
  function handleEscape(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false
    event.preventDefault()
    event.stopPropagation()
    if (openSubmenu.value) closeSubmenuAndFocusParent()
    else hide(true)
    return true
  }

  /** ArrowRight 展开当前行的子菜单；键盘委托只有 DOM target，允许从 dataset 恢复身份。 */
  function tryOpenSubmenuFromKeyboard(
    event: KeyboardEvent,
    target: HTMLElement | null,
  ): boolean {
    if (event.key !== 'ArrowRight') return false
    const row = target?.closest<HTMLElement>('.drop-menu__item')
    const groupId = row?.dataset.groupId
    const itemId = row?.dataset.itemId
    if (!row || groupId === undefined || itemId === undefined) return false
    const item = groups.value
      .find((group) => group.id === groupId)
      ?.items.find((entry) => entry.id === itemId)
    if (!item?.children?.length) return false
    event.preventDefault()
    void showSubmenu(groupId, item, row, true)
    return true
  }

  /** 子菜单键盘：← / Esc 回到父项，↑↓ 在子项之间移动。 */
  function onSubmenuKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    if (isEditableTarget(target)) return
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
    // relatedTarget 为空通常来自面板内不可聚焦区域的点击；真正的点击外部由 light dismiss / fallback 处理。
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

  /** 打开时唯一的焦点入口：dialog 走原生 Tab，menu 走 roving。 */
  function applyInitialFocus(): void {
    if (props.semantics === 'dialog') {
      if (props.focusOnOpen) focusDialogEntry()
      return
    }
    // 指针打开的面板只预置 tabindex，避免菜单项常驻 hover 高亮；键盘打开才移入焦点。
    if (props.focusOnOpen) roving.focusFirst(CHECKED_ITEM_SELECTOR)
    else roving.prime(CHECKED_ITEM_SELECTOR)
  }

  /** dialog 模式的首选落点：已选项优先，否则首个可用控件；Tab 顺序保持原生。 */
  function focusDialogEntry(): void {
    const root = itemsRef.value
    if (!root) return
    // dialog 里没有 menuitem 角色，选中态用按钮的 aria-pressed 表达。
    const preferred = root.querySelector<HTMLElement>(
      '.drop-menu__item-main[aria-pressed="true"]',
    )
    const target = preferred ?? root.querySelector<HTMLElement>('.drop-menu__item-main')
    target?.focus()
  }

  /** 把焦点交给首选可用项：dialog 落到首个控件，menu 优先已勾选项。 */
  function focusFirst(): void {
    if (props.semantics === 'dialog') {
      focusDialogEntry()
      return
    }
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
    /* 行尾状态的统一内缩；check、action 与开关都消费同一份值。 */
    --drop-menu-trailing-inset: var(--klc-space-12, 12px);
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
    padding-right: var(--drop-menu-trailing-inset);
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
