<!-- 分组下拉菜单：统一整行选项、选中态及操作区样式。 -->
<template>
  <div class="drop-menu">
    <BaseTooltip :content="label" :placement="tooltipPlacement ?? 'top'" :disabled="open || disabled">
      <button
        ref="trigger"
        type="button"
        class="control-button drop-menu__trigger"
        :class="triggerClass"
        v-bind="popover.triggerBindings.value"
        :aria-label="label"
        aria-haspopup="menu"
        :disabled="disabled"
        @click="popover.onTriggerClick"
        @keydown="onTriggerKeydown"
      >
        <slot name="trigger">{{ label }}</slot>
      </button>
    </BaseTooltip>
    <Teleport :to="teleportTarget">
      <div
        ref="menu"
        class="drop-menu__panel"
        :class="{
          'drop-menu__panel--compact': density === 'compact',
          'drop-menu__panel--replace-detail': replaceDetailOnAction,
        }"
        v-bind="popover.panelBindings.value"
        role="menu"
        :aria-label="label"
        @keydown="onMenuKeydown"
        @focusout="onMenuFocusOut"
      >
       <template v-if="open">
        <div v-for="group in groups" :key="group.id" class="drop-menu__group">
          <div class="drop-menu__heading">{{ group.label }}</div>
          <div
            v-for="item in group.items"
            :key="item.id"
            class="drop-menu__item"
            :class="{ 'is-active': item.active }"
          >
            <slot name="item" :group="group" :item="item" :select="() => select(group.id, item.id)">
            <button
              type="button"
              class="drop-menu__item-main"
              role="menuitem"
              :disabled="item.disabled"
              @click="select(group.id, item.id)"
            >
              <slot name="item-icon" :group="group" :item="item" />
              <span>{{ item.label }}</span>
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
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, useTemplateRef } from 'vue'

  import { useAnchoredPopover } from '../composables/overlay/useAnchoredPopover.js'
  import { useRovingFocus } from '../composables/overlay/useRovingFocus.js'
  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'
  import BaseTooltip from './common/BaseTooltip.vue'

  export interface DropMenuGroup {
    id: string
    label: string
    items: ReadonlyArray<{
      id: string
      label: string
      disabled?: boolean
      active?: boolean
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
    message?: string
    /** 分组为空时展示的提示；未提供时不渲染空提示。 */
    emptyText?: string
    /** 菜单项行高；默认松散，短选项列表可使用紧凑模式。 */
    density?: 'compact' | 'loose'
    /** 管理操作需要在同一面板内展开表单。 */
    keepOpenOnSelect?: boolean
    /** 操作区浮于详情位置，悬停或聚焦行时替换 drop-menu__item-detail。 */
    replaceDetailOnAction?: boolean
  }>()
  const emit = defineEmits<{
    select: [groupId: string, itemId: string]
    open: []
  }>()
  const triggerRef = useTemplateRef<HTMLElement>('trigger')
  const menuRef = useTemplateRef<HTMLElement>('menu')
  const teleportTarget = useFullscreenTeleportTarget()
  const roving = useRovingFocus(menuRef, {
    itemSelector: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
  })
  const popover = useAnchoredPopover({
    trigger: triggerRef,
    panel: menuRef,
    placement: () => props.placement ?? 'auto',
    offset: 4,
    maxHeight: () => 'min(420px, calc(100vh - 24px))',
    disabled: () => props.disabled ?? false,
    onOpen: () => {
      emit('open')
      // APG menu button：打开后焦点进入第一个可用项。
      roving.focusFirst('.is-active [role="menuitem"]')
    },
  })
  const open = popover.open

  function show(): void {
    popover.show()
  }

  function hide(restoreFocus = false): void {
    popover.hide({ restoreFocus })
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      show()
    } else if (event.key === 'Escape' && open.value) {
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

  onBeforeUnmount(() => hide())

  defineExpose({ show, hide })
</script>

<!-- 触发器复用工具栏共享按钮外观，避免各下拉各写一套高度与字体。 -->
<style scoped src="./common/control-button.css"></style>

<style scoped>
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
    overflow-y: auto;
    border-radius: var(--klc-radius-md, 8px);
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-text);
    box-shadow: var(--klc-elevation-2, 0 6px 12px rgb(0 0 0 / 0.18));
  }

  .drop-menu__panel:empty {
    min-width: 0;
  }

  .drop-menu__group + .drop-menu__group {
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .drop-menu__footer {
    padding: var(--klc-space-8, 8px);
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .drop-menu__heading:empty {
    display: none;
  }

  .drop-menu__item-action:empty,
  .drop-menu__footer:empty {
    display: none;
  }

  .drop-menu__heading {
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px) var(--klc-space-4, 4px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    font-weight: 500;
    line-height: 16px;
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

  .drop-menu__item:hover,
  .drop-menu__item:focus-within {
    background: var(--klc-color-ui-hover);
  }

  /* 选中项常驻显示，用比 hover 更浅的公共 Token，避免整行过重。 */
  .drop-menu__item.is-active {
    background: var(--klc-color-ui-selected);
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

  .drop-menu__item :deep(.drop-menu__item-main svg) {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .drop-menu__item-action {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
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
    width: 26px;
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
    transition: transform var(--klc-motion-duration-moderate);
  }

  .drop-menu__item :deep(.drop-menu__switch[aria-checked='true'] span) {
    transform: translateX(12px);
  }
</style>
