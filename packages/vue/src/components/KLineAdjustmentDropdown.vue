<template>
  <Dropdown
    :model-value="modelValue"
    :options="visibleOptions"
    label="复权"
    title="复权方式"
    size="md"
    @update:model-value="emit('update:modelValue', $event as KLineAdjustment)"
  />
</template>

<script setup lang="ts">
  import type { AdjustType } from '@363045841yyt/klinechart-core/semantic'
  import { computed } from 'vue'

  import Dropdown from './Dropdown.vue'

  export type KLineAdjustment = AdjustType

  const adjustmentOptions: Array<{ label: string; value: KLineAdjustment }> = [
    { label: '前复权', value: 'qfq' },
    { label: '后复权', value: 'hfq' },
    { label: '仅拆股', value: 'splits' },
    { label: '不复权', value: 'none' },
  ]

  const props = defineProps<{
    modelValue?: string
    supportedAdjustments?: ReadonlyArray<KLineAdjustment>
  }>()

  /** 根据当前品种能力过滤复权选项；未提供能力时保持旧行为。 */
  const visibleOptions = computed(() => {
    if (!props.supportedAdjustments) return adjustmentOptions
    const supported = new Set(props.supportedAdjustments)
    return adjustmentOptions.filter((option) => supported.has(option.value))
  })

  const emit = defineEmits<{
    (e: 'update:modelValue', adjust: KLineAdjustment): void
  }>()
</script>
