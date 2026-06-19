<template>
  <Dropdown
    :model-value="modelValue"
    :options="kLineLevelOptions"
    label="级别"
    title="K线级别"
    size="md"
    @update:model-value="emit('update:modelValue', $event as KLineLevel)"
  />
</template>

<script setup lang="ts">
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

defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', level: KLineLevel): void
}>()
</script>
