<!-- Appends the registered keyboard shortcut to a tooltip. -->
<template>
  <BaseTooltip v-bind="$attrs" :shortcut="shortcut"><slot /></BaseTooltip>
</template>

<script setup lang="ts">
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import { useCommandShortcut } from './useCommandShortcut.js'

  defineOptions({ inheritAttrs: false })
  const props = defineProps<{ command: string }>()
  const shortcut = useCommandShortcut(() => props.command)
</script>
