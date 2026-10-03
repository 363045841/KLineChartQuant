<template>
  <div ref="rootRef" class="drop-menu">
    <BaseTooltip :content="label" placement="top" :disabled="open || disabled">
      <button
        ref="triggerRef"
        type="button"
        class="drop-menu__trigger"
        :class="triggerClass"
        :aria-label="label"
        aria-haspopup="menu"
        :aria-expanded="open"
        :disabled="disabled"
        @click="toggle"
        @keydown.down.prevent="show(true)"
        @keydown.escape.stop="hide()"
      >
        <slot name="trigger">{{ label }}</slot>
      </button>
    </BaseTooltip>
    <Teleport :to="teleportTarget">
      <div
        v-if="open"
        ref="menuRef"
        class="drop-menu__panel"
        :style="menuStyle"
        role="menu"
        :aria-label="label"
        @keydown.escape.stop.prevent="hide(true)"
        @keydown.down.prevent="focusItem(1)"
        @keydown.up.prevent="focusItem(-1)"
      >
        <div v-for="group in groups" :key="group.id" class="drop-menu__group">
          <div class="drop-menu__heading">{{ group.label }}</div>
          <div
            v-for="item in group.items"
            :key="item.id"
            class="drop-menu__item"
          >
            <button
              type="button"
              class="drop-menu__item-main"
              role="menuitem"
              :disabled="item.disabled"
              @click="select(group.id, item.id)"
            >{{ item.label }}</button>
            <span v-if="$slots['item-action']" class="drop-menu__item-action">
              <slot name="item-action" :group="group" :item="item" />
            </span>
          </div>
          <div v-if="group.items.length === 0 && emptyText" class="drop-menu__empty">
            {{ emptyText }}
          </div>
        </div>
        <div v-if="message" class="drop-menu__message" role="alert">{{ message }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

  import { useClickOutside } from '../composables/useClickOutside.js'
  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'
  import { useTeleportedPopup } from '../composables/useTeleportedPopup.js'
  import BaseTooltip from './common/BaseTooltip.vue'

  export interface DropMenuGroup {
    id: string
    label: string
    items: ReadonlyArray<{ id: string; label: string; disabled?: boolean }>
  }

  const props = defineProps<{
    label: string
    groups: ReadonlyArray<DropMenuGroup>
    disabled?: boolean
    triggerClass?: string
    /** 菜单相对触发按钮的弹出方向。 */
    placement?: 'auto' | 'top' | 'bottom'
    message?: string
    /** 分组为空时展示的提示；未提供时不渲染空提示。 */
    emptyText?: string
  }>()
  const emit = defineEmits<{
    select: [groupId: string, itemId: string]
    open: []
  }>()
  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLElement | null>(null)
  const menuRef = ref<HTMLElement | null>(null)
  const open = ref(false)
  const teleportTarget = useFullscreenTeleportTarget()
  const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
    triggerRef,
    menuRef,
    4,
    false,
    props.placement,
  )
  const menuStyle = computed(() => ({ ...popupStyle.value, zIndex: 1010 }))

  useClickOutside(
    () => [rootRef.value, menuRef.value],
    () => hide(),
    {
      enabled: () => open.value,
    },
  )

  function show(focus = false) {
    if (open.value || props.disabled) return
    open.value = true
    emit('open')
    startPositionSync()
    if (focus)
      void nextTick(() =>
        menuRef.value
          ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
          ?.focus(),
      )
  }

  function hide(restoreFocus = false) {
    if (!open.value) return
    open.value = false
    stopPositionSync()
    if (restoreFocus) triggerRef.value?.focus()
  }

  function toggle() {
    if (open.value) hide()
    else show()
  }

  function focusItem(direction: number) {
    const items = [
      ...(menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        []),
    ]
    if (!items.length) return
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(index + direction + items.length) % items.length]?.focus()
  }

  function select(groupId: string, itemId: string) {
    hide()
    emit('select', groupId, itemId)
  }

  onBeforeUnmount(() => hide())
</script>

<style scoped>
  .drop-menu {
    flex: 0 0 auto;
  }

  .drop-menu__trigger {
    height: 24px;
    padding: 0 7px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .drop-menu__trigger:hover,
  .drop-menu__trigger:focus-visible {
    background: var(--klc-color-ui-hover);
  }

  .drop-menu__panel {
    min-width: 150px;
    max-width: min(280px, calc(100vw - 16px));
    padding: 4px;
    overflow-y: auto;
    border-radius: 8px;
    background: var(--klc-color-ui-input);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.18);
  }

  .drop-menu__group + .drop-menu__group {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .drop-menu__heading,
  .drop-menu__empty {
    padding: 5px 8px;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
  }

  .drop-menu__message {
    padding: 6px 8px;
    color: var(--klc-color-ui-danger-text);
    font-size: 12px;
  }

  .drop-menu__item {
    display: flex;
    align-items: center;
    border-radius: 4px;
  }

  .drop-menu__item:hover,
  .drop-menu__item:focus-within {
    background: var(--klc-color-ui-hover);
  }

  .drop-menu__item-main {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .drop-menu__item-action {
    display: flex;
    flex: 0 0 auto;
    visibility: hidden;
  }

  .drop-menu__item:hover .drop-menu__item-action,
  .drop-menu__item:focus-within .drop-menu__item-action {
    visibility: visible;
  }

  .drop-menu__item-action :deep(button) {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
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

  .drop-menu__item-main:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
