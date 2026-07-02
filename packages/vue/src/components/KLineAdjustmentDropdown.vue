<template>
  <Dropdown
    :model-value="modelValue"
    :options="adjustmentOptions"
    label="复权"
    title="复权方式"
    size="md"
    @update:model-value="emit('update:modelValue', $event as KLineAdjustment)"
  />
</template>

<script setup lang="ts">
  import type { AdjustType } from '@363045841yyt/klinechart-core/semantic'

  import Dropdown from './Dropdown.vue'

  export type KLineAdjustment = AdjustType

  const adjustmentOptions: Array<{ label: string; value: KLineAdjustment }> = [
    { label: '前复权', value: 'qfq' },
    { label: '后复权', value: 'hfq' },
    { label: '仅拆股', value: 'splits' },
    { label: '不复权', value: 'none' },
  ]

  defineProps<{
    modelValue?: string
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', adjust: KLineAdjustment): void
  }>()
</script>
