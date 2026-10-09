<!-- “?” 快捷键表：内容完全由命令注册表生成。 -->
<template>
  <BaseModal
    :show="open"
    title="快捷键"
    subtitle="Keyboard shortcuts"
    width="min(92vw, 480px)"
    @close="open = false"
  >
    <ShortcutList :registry="registry" />
  </BaseModal>
</template>

<script setup lang="ts">
  import type { CommandRegistry } from '@363045841yyt/klinechart-core'
  import BaseModal from '../BaseModal.vue'
  import ShortcutList from './ShortcutList.vue'

  withDefaults(defineProps<{ registry?: CommandRegistry | null }>(), { registry: undefined })
  const open = defineModel<boolean>('open', { default: false })
</script>
