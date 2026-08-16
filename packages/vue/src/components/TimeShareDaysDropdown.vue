<template>
  <Dropdown
    :model-value="String(modelValue)"
    :options="visibleOptions"
    label="天数"
    title="分时天数"
    size="md"
    @update:model-value="emit('update:modelValue', Number($event))"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import Dropdown from './Dropdown.vue'

  const props = withDefaults(
    defineProps<{
      modelValue?: number
      maxTradingDays: number
    }>(),
    { modelValue: 1 },
  )

  const dayOptions = [1, 2, 3, 5, 10, 20]
  const visibleOptions = computed(() =>
    dayOptions
      .filter((days) => days <= props.maxTradingDays)
      .map((days) => ({ label: `${days}日`, value: String(days) })),
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', days: number): void
  }>()
</script>
