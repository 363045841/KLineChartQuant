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
        @keydown.tab="hide()"
      >
        <div v-for="group in groups" :key="group.id" class="drop-menu__group">
          <div class="drop-menu__heading">{{ group.label }}</div>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            role="menuitem"
            :disabled="item.disabled"
            @click="select(group.id, item.id)"
          >{{ item.label }}</button>
          <div v-if="group.items.length === 0" class="drop-menu__empty">暂无模板</div>
        </div>
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
        menuRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(),
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
      ...(menuRef.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
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

  .drop-menu__group button {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .drop-menu__group button:hover:not(:disabled),
  .drop-menu__group button:focus-visible {
    background: var(--klc-color-ui-hover);
  }

  .drop-menu__group button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
