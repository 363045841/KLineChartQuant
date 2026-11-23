<!-- K 线级别选择入口：级别选项与收藏配置在这里绑定，渲染复用工具栏选项下拉。 -->
<template>
  <KLineOptionPicker
    title="级别"
    favorites-label="收藏级别"
    :options="K_LINE_LEVEL_OPTIONS"
    :supported="supportedLevels"
    :model-value="modelValue"
    :favorites="favorites"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
  import { useKLineLevelFavorites } from '@vue-src/composables/chart/useKLineLevelFavorites.js'
  import KLineOptionPicker from './KLineOptionPicker.vue'
  import { K_LINE_LEVEL_OPTIONS, type KLineLevel } from './kLineLevel'

  defineProps<{
    modelValue?: string
    supportedLevels?: ReadonlyArray<KLineLevel>
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', level: KLineLevel): void
  }>()

  const favorites = useKLineLevelFavorites()
</script>
