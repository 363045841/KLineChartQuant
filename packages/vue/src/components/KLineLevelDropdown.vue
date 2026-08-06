<template>
  <Dropdown
    :model-value="modelValue"
    :options="visibleOptions"
    label="级别"
    title="K线级别"
    size="md"
    @update:model-value="emit('update:modelValue', $event as KLineLevel)"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import Dropdown from './Dropdown.vue'

  export type KLineLevel =
    | '1min'
    | '5min'
    | '15min'
    | '30min'
    | '60min'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'quarterly'
    | 'yearly'
    | 'timeshare'

  const kLineLevelOptions: Array<{ label: string; value: KLineLevel }> = [
    { label: '分时', value: 'timeshare' },
    { label: '1day', value: 'daily' },
    { label: '1min', value: '1min' },
    { label: '5min', value: '5min' },
    { label: '15min', value: '15min' },
    { label: '30min', value: '30min' },
    { label: '1小时', value: '60min' },
    { label: '1周', value: 'weekly' },
    { label: '1月', value: 'monthly' },
    { label: '3月', value: 'quarterly' },
    { label: '12月', value: 'yearly' },
  ]

  const props = defineProps<{
    modelValue?: string
    supportedLevels?: ReadonlyArray<KLineLevel>
  }>()

  /** 根据当前品种能力过滤周期选项；未提供能力时保持旧行为。 */
  const visibleOptions = computed(() => {
    if (!props.supportedLevels) return kLineLevelOptions
    const supported = new Set(props.supportedLevels)
    return kLineLevelOptions.filter((option) => supported.has(option.value))
  })

  const emit = defineEmits<{
    (e: 'update:modelValue', level: KLineLevel): void
  }>()
</script>
