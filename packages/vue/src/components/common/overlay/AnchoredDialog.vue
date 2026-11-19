<!-- A non-modal dialog anchored to an element or pointer position. -->
<template>
  <Teleport :to="target">
    <div
      ref="element"
      class="anchored-dialog popover-surface popover-surface--scroll klc-overlay"
      role="dialog"
      :aria-label="label"
      tabindex="-1"
      v-bind="surface.panelBindings.value"
      @keydown.escape.stop.prevent="surface.hide({ restoreFocus: true })"
    >
      <slot v-if="open" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import './popover-surface.css'
  import { type SurfaceAnchor, useAnchoredSurface } from '@vue-src/composables/overlay/useAnchoredSurface.js'
  import { useFullscreenTeleportTarget } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import { useTemplateRef } from 'vue'

  const props = defineProps<{
    open: boolean
    anchor: SurfaceAnchor | null
    label: string
    restoreFocusTo?: HTMLElement | null
  }>()
  const emit = defineEmits<{ open: []; 'update:open': [open: boolean] }>()
  const target = useFullscreenTeleportTarget()
  const element = useTemplateRef<HTMLElement>('element')
  const surface = useAnchoredSurface(props, element, () => {
    if (element.value && !element.value.contains(document.activeElement)) element.value.focus()
    emit('open')
  }, () => emit('update:open', false))

  defineExpose({ element })
</script>

<style scoped>
  .anchored-dialog {
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100vw - 2 * var(--klc-space-8, 8px));
    padding: 0;
  }
</style>
