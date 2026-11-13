<!-- 分组下拉菜单：统一整行选项、选中态及操作区样式；context 模式按指针坐标弹出右键菜单。 -->
<template>
  <div class="drop-menu" :class="{ 'drop-menu--fill': fill }">
    <BaseTooltip
      v-if="!context"
      :content="label"
      :placement="tooltipPlacement ?? 'top'"
      :disabled="isOpen || disabled"
      :command="command"
      :fill="fill"
    >
      <ControlTrigger
        ref="triggerControl"
        :class="triggerClass"
        v-bind="popover.triggerBindings.value"
        :label="label"
        aria-haspopup="menu"
        :disabled="disabled"
        @pointerdown="onTriggerPointerDown"
        @click="popover.onTriggerClick"
        @keydown="onTriggerKeydown"
      >
        <slot name="trigger" :open="isOpen">{{ label }}</slot>
      </ControlTrigger>
    </BaseTooltip>
    <Teleport :to="teleportTarget">
      <div
        ref="menu"
        class="drop-menu__panel popover-surface popover-surface--scroll"
        :class="{
          'drop-menu__panel--compact': density === 'compact',
          'drop-menu__panel--replace-detail': replaceDetailOnAction,
        }"
        v-bind="popover.panelBindings.value"
        :role="panelRole ?? 'menu'"
        :aria-label="label"
        @keydown="onMenuKeydown"
        @focusout="onMenuFocusOut"
        @focusin="onMenuFocusIn"
        @pointerover="onMenuPointerOver"
        @pointerleave="hideHighlight"
        @scroll.passive="closeSubmenu"
      >
        <template v-if="isOpen">
          <div ref="items" class="drop-menu__items">
            <SlidingHighlight ref="highlight" class="drop-menu__highlight" />
            <div v-if="bodyMode" class="drop-menu__body">
              <slot name="body" />
            </div>
            <template v-else>
              <div v-if="$slots.header" class="drop-menu__header">
                <slot name="header" />
              </div>
              <div v-for="group in groups" :key="group.id" class="drop-menu__group">
                <div v-if="group.label" class="drop-menu__heading">{{ group.label }}</div>
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="drop-menu__item"
                  :class="{ 'is-active': item.active }"
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
                    <button
                      type="button"
                      class="drop-menu__item-main"
                      role="menuitem"
                      :disabled="item.disabled"
                      :title="item.disabled ? item.reason : undefined"
                      :aria-haspopup="item.children?.length ? 'menu' : undefined"
                      :aria-expanded="item.children?.length ? isSubmenuOpen(item) : undefined"
                      @click="activateItem(group.id, item)"
                    >
                      <span v-if="hasMainIcons" class="drop-menu__icon">
                        <component :is="item.icon" v-if="item.icon" aria-hidden="true" />
                      </span>
                      <span>{{ item.label }}</span>
                      <span v-if="item.shortcut" class="drop-menu__shortcut">{{ item.shortcut }}</span>
                      <span v-if="item.children?.length" class="drop-menu__submenu-arrow">
                        <IconTablerChevronRight aria-hidden="true" />
                      </span>
                    </button>
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
              :class="{ 'is-active': child.active }"
            >
              <button
                type="button"
                class="drop-menu__item-main"
                :role="child.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
                :aria-checked="child.checked === undefined ? undefined : child.checked"
                :disabled="child.disabled"
                :title="child.disabled ? child.reason : undefined"
                @click="selectSubmenuItem(openSubmenuGroupId, openSubmenuItem, child)"
              >
                <span v-if="hasSubmenuIcons" class="drop-menu__icon">
                  <component :is="child.icon" v-if="child.icon" aria-hidden="true" />
                </span>
                <span>{{ child.label }}</span>
                <span class="drop-menu__check" aria-hidden="true">
                  <IconTablerCheck v-if="child.checked" />
                </span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import './popover-surface.css'

  import { useAnchoredPopover } from '@vue-src/composables/overlay/useAnchoredPopover.js'
  import { useRovingFocus } from '@vue-src/composables/overlay/useRovingFocus.js'
  import { useFullscreenTeleportTarget } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import {
    type Component,
    type CSSProperties,
    computed,
    nextTick,
    onScopeDispose,
    shallowRef,
    useTemplateRef,
    watch,
  } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import BaseTooltip from './BaseTooltip.vue'
  import ControlTrigger from './ControlTrigger.vue'
  import SlidingHighlight from './SlidingHighlight.vue'

  export interface DropMenuItem {
    id: string
    label: string
    disabled?: boolean
    active?: boolean
    /** 左侧图标；菜单内所有项都没有图标时不保留图标槽位。 */
    icon?: Component
    /** 复选项的勾选态；有值时按 menuitemcheckbox 渲染，且选择后不关闭菜单。 */
    checked?: boolean
    /** 键盘快捷键文本；右侧弱化展示，由调用方决定是否提供。 */
    shortcut?: string
    /** 禁用原因；默认按钮通过 title 展示。 */
    reason?: string
    /** 管理菜单用来决定是否展示删除操作；普通列表可省略。 */
    deletable?: boolean
    /** 二级菜单项；存在时该行只展开子菜单，不触发 select。 */
    children?: ReadonlyArray<DropMenuItem>
  }

  export interface DropMenuGroup {
    id: string
    label: string
    items: ReadonlyArray<DropMenuItem>
  }

  const props = defineProps<{
    label: string
    groups: ReadonlyArray<DropMenuGroup>
    disabled?: boolean
    triggerClass?: string
    /** 菜单相对触发按钮的弹出方向。 */
    placement?: 'auto' | 'top' | 'bottom'
    /** 按钮提示的显示方向，独立于菜单弹出方向。 */
    tooltipPlacement?: 'top' | 'bottom'
    /** 关联命令 id；存在时按钮提示追加该命令的快捷键。 */
    command?: string
    message?: string
    /** 分组为空时展示的提示；未提供时不渲染空提示。 */
    emptyText?: string
    /** 菜单项行高；默认松散，短选项列表可使用紧凑模式。 */
    density?: 'compact' | 'loose'
    /** 管理操作需要在同一面板内展开表单。 */
    keepOpenOnSelect?: boolean
    /** 操作区浮于详情位置，悬停或聚焦行时替换 drop-menu__item-detail。 */
    replaceDetailOnAction?: boolean
    /** 撑满父容器：设置行里的下拉与输入同宽，轴边入口占满整格。 */
    fill?: boolean
    /** 坐标模式：不渲染触发器，由宿主调用 openAt 在指针处弹出。 */
    context?: boolean
    /** 坐标模式关闭后归还焦点的元素，通常为图表容器。 */
    focusTarget?: HTMLElement | null
    /** 面板语义角色；表单/预览等非菜单内容使用 dialog。 */
    panelRole?: 'menu' | 'dialog'
    /** 打开后把焦点移入首个可用项；脚本右键菜单需要键盘直接可用。 */
    focusOnOpen?: boolean
    /** 用 body 插槽替换默认分组内容，供表单、预览等自定义面板使用。 */
    bodyMode?: boolean
    /** 受控打开状态；由 controlled + open + update:open 共同驱动。 */
    controlled?: boolean
    open?: boolean
    /** 受控坐标锚点；提供时以该矩形弹出，无需调用 openAt。 */
    origin?: { x: number; y: number; width?: number; height?: number } | null
    /** 面板与锚点的间距；坐标模式默认贴住指针，普通下拉默认 4px。 */
    offset?: number
  }>()
  const emit = defineEmits<{
    select: [groupId: string, itemId: string, parentId?: string]
    open: []
    close: []
    'update:open': [open: boolean]
  }>()
  const triggerControl = useTemplateRef<InstanceType<typeof ControlTrigger>>('triggerControl')
  const triggerRef = computed(() => triggerControl.value?.element ?? null)
  const menuRef = useTemplateRef<HTMLElement>('menu')
  /** 主菜单项容器；与二级菜单分开，roving focus 不会把子项算进主列表。 */
  const itemsRef = useTemplateRef<HTMLElement>('items')
  const submenuRef = useTemplateRef<HTMLElement>('submenu')
  const teleportTarget = useFullscreenTeleportTarget()
  const roving = useRovingFocus(itemsRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })
  const submenuRoving = useRovingFocus(submenuRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })
  // 同一时间只展开一个二级菜单；浮层浮在主面板之上，但不另起 popover。
  // 只保存 id，子项内容始终从最新的 groups 派生，勾选态才能随 Core 快照更新。
  const openSubmenuItemId = shallowRef<string | null>(null)
  const openSubmenuGroupId = shallowRef<string | null>(null)
  const submenuAnchor = shallowRef<HTMLElement | null>(null)
  const submenuStyle = shallowRef<CSSProperties>({ display: 'none' })
  const openSubmenuItem = computed(() => {
    const group = props.groups.find((group) => group.id === openSubmenuGroupId.value)
    return group?.items.find((item) => item.id === openSubmenuItemId.value) ?? null
  })
  // 图标槽位只在确实有图标时保留；全部项都没有图标时整列不占宽度。
  const hasMainIcons = computed(() =>
    props.groups.some((group) => group.items.some((item) => item.icon !== undefined)),
  )
  const hasSubmenuIcons = computed(() =>
    (openSubmenuItem.value?.children ?? []).some((item) => item.icon !== undefined),
  )
  // 命令式坐标（右键菜单）与受控坐标共用同一个原点。
  const contextOrigin = shallowRef<{ x: number; y: number } | null>(null)
  const origin = computed(() => props.origin ?? contextOrigin.value)
  // 记录本次打开是否由指针触发，用于区分是否把焦点移入菜单项。
  let pointerOpened = false
  const popover = useAnchoredPopover({
    trigger: triggerRef,
    panel: menuRef,
    // 普通下拉保留触发器锚定与 CSS anchor；坐标模式改用指针原点。
    origin: props.context || props.origin !== undefined ? origin : undefined,
    restoreFocusTo: () => props.focusTarget ?? null,
    placement: () => props.placement ?? 'auto',
    offset: props.offset ?? (props.context ? 0 : 4),
    maxHeight: () => 'min(420px, calc(100vh - 24px))',
    disabled: () => props.disabled ?? false,
    onOpen: () => {
      emit('open')
      // 指针打开与坐标模式只预置 tabindex：把焦点移入菜单项会让该项常驻 hover 高亮，
      // 鼠标移开后仍像被选中。键盘打开才把焦点移入第一个可用项（APG menu button）。
      if (props.focusOnOpen) roving.focusFirst('.is-active [role="menuitem"]')
      else if (props.context || pointerOpened) roving.prime('.is-active [role="menuitem"]')
      else roving.focusFirst('.is-active [role="menuitem"]')
    },
    onClose: () => {
      emit('close')
      if (props.controlled) emit('update:open', false)
    },
  })
  // 受控模式下以宿主传入的 open 为准；未传 controlled 时沿用 popover 的内部状态。
  const isOpen = computed(() => (props.controlled ? props.open === true : popover.open.value))
  watch(
    () => (props.controlled ? props.open : undefined),
    (next) => {
      if (next === undefined) return
      if (next) popover.show()
      else popover.hide({ restoreFocus: false })
    },
    { flush: 'post', immediate: true },
  )
  // 整个面板共用一块悬停高亮：移动时只改位置和高度，形成滑动过渡而不是淡入淡出。
  const highlight = useTemplateRef<InstanceType<typeof SlidingHighlight>>('highlight')

  /** 把高亮块对齐到目标菜单项。 */
  function moveHighlight(item: HTMLElement): void {
    highlight.value?.moveTo(item)
  }

  /** 指针或键盘离开菜单项时收起高亮块。 */
  function hideHighlight(): void {
    highlight.value?.hide()
  }

  const SUBMENU_HOVER_DELAY = 120
  const SUBMENU_CLOSE_DELAY = 160
  let submenuTimer: ReturnType<typeof setTimeout> | undefined

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
      anchor.dataset.groupId ?? props.groups.find((group) => group.items.includes(item))?.id ?? null
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
    select(groupId, item.id)
  }

  function selectSubmenuItem(
    groupId: string | null,
    parent: DropMenuItem | null,
    child: DropMenuItem,
  ): void {
    if (child.disabled || groupId === null || parent === null) return
    // 复选项切换后保持菜单打开，方便连续勾选多个周期。
    if (child.checked !== undefined) {
      emit('select', groupId, child.id, parent.id)
      return
    }
    if (!props.keepOpenOnSelect) hide(true)
    emit('select', groupId, child.id, parent.id)
  }

  function closeSubmenuAndFocusParent(): void {
    const anchor = submenuAnchor.value
    const focusTarget = anchor?.querySelector<HTMLElement>('.drop-menu__item-main') ?? anchor
    closeSubmenu()
    focusTarget?.focus()
  }

  /** 面板级委托：指针在菜单项之间移动时让高亮块滑过去；二级菜单有自己的 hover 底色。 */
  function onMenuPointerOver(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null
    if (target && submenuRef.value?.contains(target)) return
    const item = target?.closest<HTMLElement>('.drop-menu__item') ?? null
    if (item) moveHighlight(item)
    else hideHighlight()
  }

  /** 键盘焦点切换与指针同样驱动高亮块。 */
  function onMenuFocusIn(event: FocusEvent): void {
    const target = event.target instanceof Element ? event.target : null
    if (target && submenuRef.value?.contains(target)) return
    const item = target?.closest<HTMLElement>('.drop-menu__item') ?? null
    if (item) moveHighlight(item)
  }

  // 关闭后清空高亮与子菜单，重新打开不会残留上一项的位置。
  watch(isOpen, (next) => {
    if (next) return
    hideHighlight()
    closeSubmenu()
  })

  /** 指针按下触发器：本次打开不移入焦点，避免菜单项常驻高亮。 */
  function onTriggerPointerDown(): void {
    pointerOpened = true
  }

  function show(): void {
    popover.show()
  }

  /** 坐标模式入口：记录指针位置后打开，已打开时只更新位置。 */
  function openAt(x: number, y: number): void {
    pointerOpened = false
    closeSubmenu()
    contextOrigin.value = { x, y }
    show()
  }

  function hide(restoreFocus = false): void {
    closeSubmenu()
    popover.hide({ restoreFocus })
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      // 键盘操作：打开时移入焦点；已打开则把焦点从触发器移入菜单。
      if (isOpen.value) {
        roving.focusFirst('.is-active [role="menuitem"]')
      } else {
        pointerOpened = false
        show()
      }
    } else if (event.key === 'Escape' && isOpen.value) {
      event.preventDefault()
      event.stopPropagation()
      hide(true)
    }
  }

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
          : props.groups
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

  /** 焦点离开面板（Tab 出去或点击别处）时关闭。 */
  function onMenuFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null
    if (!next) return
    if (menuRef.value?.contains(next) || triggerRef.value?.contains(next)) return
    hide()
  }

  function select(groupId: string, itemId: string) {
    if (!props.keepOpenOnSelect) hide(true)
    emit('select', groupId, itemId)
  }

  // 窗口尺寸变化时子菜单的 fixed 坐标会失效，直接收起，等下一次 hover/键盘重新测量。
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', closeSubmenu, { passive: true })
  }
  onScopeDispose(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', closeSubmenu)
    cancelSubmenuClose()
  })

  defineExpose({ show, hide, openAt, element: menuRef })
</script>


<style scoped>
  /* 撑满父容器：触发按钮随之铺满，轴边/设置行不再需要穿透改尺寸。 */
  .drop-menu--fill {
    display: block;
    width: 100%;
    height: 100%;
  }

  .drop-menu--fill .drop-menu__trigger {
    width: 100%;
  }

  .drop-menu {
    flex: 0 0 auto;
  }

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

  /* 组间分隔线内缩，和菜单项文字的左右边界对齐，不顶到面板圆角。 */
  .drop-menu__group + .drop-menu__group {
    position: relative;
  }

  .drop-menu__group + .drop-menu__group::before {
    position: absolute;
    top: 0;
    right: var(--klc-space-8, 8px);
    left: var(--klc-space-8, 8px);
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

  /* 分组标题居中对齐，两侧各一条延伸到面板边缘的分隔线。 */
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

  /* 选中项常驻显示，用比 hover 更浅的公共 Token，避免整行过重。 */
  .drop-menu__item.is-active {
    background: var(--klc-color-ui-selected);
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
  .drop-menu__icon {
    display: inline-flex;
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    align-items: center;
    justify-content: center;
  }

  /* 图标默认弱化，悬停整行时提亮并轻微放大，提示当前可操作项。 */
  .drop-menu__item :deep(.drop-menu__item-main svg) {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    color: var(--klc-color-ui-text-soft);
    transform-origin: center;
    transition:
      color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .drop-menu__item:hover :deep(.drop-menu__item-main svg),
  .drop-menu__item:focus-within :deep(.drop-menu__item-main svg) {
    color: var(--klc-color-ui-text);
    transform: scale(1.12);
  }

  /* 快捷键右对齐并弱化，避免和菜单项文案争夺视觉重量。 */
  .drop-menu__shortcut {
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

  .drop-menu__panel--replace-detail .drop-menu__item {
    position: relative;
  }

  .drop-menu__panel--replace-detail .drop-menu__item-action {
    position: absolute;
    top: 50%;
    right: 10px;
    padding: 0;
    transform: translateY(-50%);
  }

  /* 保留详情自身的尺寸，避免切换操作时面板宽度跳动；操作区不占布局空间。 */
  .drop-menu__panel--replace-detail .drop-menu__item:hover :deep(.drop-menu__item-detail),
  .drop-menu__panel--replace-detail .drop-menu__item:focus-within :deep(.drop-menu__item-detail) {
    visibility: hidden;
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

  .drop-menu__submenu-arrow {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    margin-left: var(--klc-space-4, 4px);
    color: var(--klc-color-ui-text-soft);
  }

  .drop-menu__check {
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
