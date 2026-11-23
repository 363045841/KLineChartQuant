<!-- 复权方式选择入口：复权选项与收藏配置在这里绑定，渲染复用工具栏选项下拉。 -->
<template>
  <KLineOptionPicker
    title="复权方式"
    favorites-label="收藏复权方式"
    :options="ADJUSTMENT_OPTIONS"
    :supported="supportedAdjustments"
    :model-value="modelValue"
    :favorites="favorites"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
  import { KLineAdjustment } from '@363045841yyt/klinechart-core/market-data'
  import { useKLineAdjustmentFavorites } from '@vue-src/composables/chart/useKLineAdjustmentFavorites.js'
  import KLineOptionPicker from './KLineOptionPicker.vue'

  export type { KLineAdjustment }

  const ADJUSTMENT_OPTIONS: ReadonlyArray<{ label: string; value: KLineAdjustment }> = [
    { label: '前复权', value: KLineAdjustment.Qfq },
    { label: '后复权', value: KLineAdjustment.Hfq },
    { label: '仅拆股', value: KLineAdjustment.Splits },
    { label: '不复权', value: KLineAdjustment.None },
  ]

  defineProps<{
    modelValue?: string
    supportedAdjustments?: ReadonlyArray<KLineAdjustment>
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', adjust: KLineAdjustment): void
  }>()

  const favorites = useKLineAdjustmentFavorites()
</script>
