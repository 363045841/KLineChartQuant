<!--
  通用锚定气泡（toggletip / 非模态面板）：Popover API + CSS anchor positioning，
  不支持时回退 floating-ui。用于替代「弹窗里再开弹窗」的说明、轻量表单等内容。

  用法：
  <BasePopover label="指标说明">
    <template #trigger="{ props }"><button v-bind="props">i</button></template>
    说明文字…
  </BasePopover>
-->
<template>
  <slot
    name="trigger"
    :props="triggerProps"
    :open="isOpen"
    :toggle="popover.toggle"
  />
  <Teleport :to="teleportTarget">
    <div
      ref="panel"
      class="base-popover"
      v-bind="popover.panelBindings.value"
      :role="role"
      :aria-label="label"
    >
      <slot v-if="isOpen" :close="close" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, ref, useTemplateRef } from 'vue'

  import { useAnchoredPopover } from '../../composables/overlay/useAnchoredPopover.js'
  import { useFullscreenTeleportTarget } from '../../composables/useFullscreenTeleportTarget.js'

  const props = withDefaults(
    defineProps<{
      /** 面板可访问名称。 */
      label: string
      placement?: 'auto' | 'top' | 'bottom'
      /** 面板语义：dialog（含可交互内容）或 note（纯说明）。 */
      role?: 'dialog' | 'note'
      maxHeight?: string
    }>(),
    { placement: 'auto', role: 'dialog', maxHeight: 'min(360px, calc(100vh - 24px))' },
  )

  const emit = defineEmits<{ open: []; close: [] }>()

  const triggerEl = ref<HTMLElement | null>(null)
  const panel = useTemplateRef<HTMLElement>('panel')
  const teleportTarget = useFullscreenTeleportTarget()

  const popover = useAnchoredPopover({
    trigger: triggerEl,
    panel,
    placement: () => props.placement,
    offset: 6,
    maxHeight: () => props.maxHeight,
    onOpen: () => emit('open'),
    onClose: () => emit('close'),
  })
  const isOpen = popover.open

  /** 触发元素通过 ref 回调登记，供定位与焦点归还使用。 */
  const triggerProps = computed(() => ({
    ...popover.triggerBindings.value,
    'aria-haspopup': props.role === 'dialog' ? ('dialog' as const) : undefined,
    ref: (element: unknown) => {
      triggerEl.value = element instanceof HTMLElement ? element : null
    },
    onClick: popover.onTriggerClick,
  }))

  function close(): void {
    popover.hide({ restoreFocus: true })
  }

  defineExpose({ show: popover.show, hide: close, toggle: popover.toggle })
</script>

<style scoped>
  .base-popover {
    box-sizing: border-box;
    max-width: min(360px, calc(100vw - 2 * var(--klc-space-8, 8px)));
    padding: var(--klc-space-12, 12px);
    border: 0;
    border-radius: var(--klc-radius-md, 8px);
    background: var(--klc-color-ui-surface);
    box-shadow: var(--klc-elevation-2), var(--klc-elevation-hairline);
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-copy-13-font-size, 13px);
    line-height: var(--klc-text-copy-13-line-height, 18px);
    overflow-y: auto;
    opacity: 1;
    translate: 0 0;
    transition:
      opacity var(--klc-motion-dur-fast, 160ms) var(--klc-motion-ease-out, ease-out),
      translate var(--klc-motion-dur-fast, 160ms) var(--klc-motion-ease-out, ease-out),
      overlay var(--klc-motion-dur-fast, 160ms) allow-discrete,
      display var(--klc-motion-dur-fast, 160ms) allow-discrete;
  }

  .base-popover:empty {
    padding: 0;
  }

  @starting-style {
    .base-popover:popover-open {
      opacity: 0;
      translate: 0 -4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .base-popover {
      transition: none;
    }
  }
</style>
