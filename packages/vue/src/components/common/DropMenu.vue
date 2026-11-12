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
      >
        <template v-if="isOpen">
          <div
            ref="highlight"
            class="drop-menu__highlight"
            :style="highlightStyle"
            aria-hidden="true"
          ></div>
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
              >
                <slot
                  name="item"
                  :group="group"
                  :item="item"
                  :select="() => select(group.id, item.id)"
                >
                  <button
                    type="button"
                    class="drop-menu__item-main"
                    role="menuitem"
                    :disabled="item.disabled"
                    :title="item.disabled ? item.reason : undefined"
                    @click="select(group.id, item.id)"
                  >
                    <slot name="item-icon" :group="group" :item="item" />
                    <span>{{ item.label }}</span>
                    <span v-if="item.shortcut" class="drop-menu__shortcut">{{ item.shortcut }}</span>
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
  import { type CSSProperties, computed, shallowRef, useTemplateRef, watch } from 'vue'
  import BaseTooltip from './BaseTooltip.vue'
  import ControlTrigger from './ControlTrigger.vue'

  export interface DropMenuGroup {
    id: string
    label: string
    items: ReadonlyArray<{
      id: string
      label: string
      disabled?: boolean
      active?: boolean
      /** 键盘快捷键文本；右侧弱化展示，由调用方决定是否提供。 */
      shortcut?: string
      /** 禁用原因；默认按钮通过 title 展示。 */
      reason?: string
      /** 管理菜单用来决定是否展示删除操作；普通列表可省略。 */
      deletable?: boolean
    }>
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
    select: [groupId: string, itemId: string]
    open: []
    close: []
    'update:open': [open: boolean]
  }>()
  const triggerControl = useTemplateRef<InstanceType<typeof ControlTrigger>>('triggerControl')
  const triggerRef = computed(() => triggerControl.value?.element ?? null)
  const menuRef = useTemplateRef<HTMLElement>('menu')
  const teleportTarget = useFullscreenTeleportTarget()
  const roving = useRovingFocus(menuRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })
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
  const HIGHLIGHT_HIDDEN: CSSProperties = { opacity: 0 }
  const highlightStyle = shallowRef<CSSProperties>(HIGHLIGHT_HIDDEN)

  /** 把高亮块对齐到目标菜单项；坐标相对面板内容区，兼容面板滚动。 */
  function moveHighlight(item: HTMLElement): void {
    const panel = menuRef.value
    if (!panel) return
    const panelRect = panel.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    highlightStyle.value = {
      height: `${itemRect.height}px`,
      transform: `translateY(${
        itemRect.top - panelRect.top - panel.clientTop + panel.scrollTop
      }px)`,
      opacity: 1,
    }
  }

  /** 指针或键盘离开菜单项时收起高亮块。 */
  function hideHighlight(): void {
    if (highlightStyle.value.opacity === 0) return
    highlightStyle.value = HIGHLIGHT_HIDDEN
  }

  /** 面板级委托：指针在菜单项之间移动时让高亮块滑过去。 */
  function onMenuPointerOver(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null
    const item = target?.closest<HTMLElement>('.drop-menu__item') ?? null
    if (item) moveHighlight(item)
    else hideHighlight()
  }

  /** 键盘焦点切换与指针同样驱动高亮块。 */
  function onMenuFocusIn(event: FocusEvent): void {
    const target = event.target instanceof Element ? event.target : null
    const item = target?.closest<HTMLElement>('.drop-menu__item') ?? null
    if (item) moveHighlight(item)
  }

  // 关闭后清空高亮，重新打开不会残留上一项的位置。
  watch(isOpen, (next) => {
    if (!isOpen) hideHighlight()
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
    contextOrigin.value = { x, y }
    show()
  }

  function hide(restoreFocus = false): void {
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
    // 行内输入框（如命名表单）保留方向键与字符输入。
    const target = event.target as HTMLElement | null
    if (target?.matches('input, textarea, select, [contenteditable]')) return
    roving.onKeydown(event)
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

  /* 共用悬停高亮块：z-index 高于选中底色、低于条目内容。 */
  .drop-menu__highlight {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    z-index: 1;
    background: var(--klc-color-ui-hover);
    pointer-events: none;
    transition:
      transform var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      height var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
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
</style>
