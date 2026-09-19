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
  import { K_LINE_LEVEL_OPTIONS, type KLineLevel } from './kLineLevel'

  const props = defineProps<{
    modelValue?: string
    supportedLevels?: ReadonlyArray<KLineLevel>
  }>()

  /** 根据当前品种能力过滤周期选项；未提供能力时保持旧行为。 */
  const visibleOptions = computed(() => {
    if (!props.supportedLevels) return [...K_LINE_LEVEL_OPTIONS]
    const supported = new Set(props.supportedLevels)
    return K_LINE_LEVEL_OPTIONS.filter((option) => supported.has(option.value))
  })

  const emit = defineEmits<{
    (e: 'update:modelValue', level: KLineLevel): void
  }>()
</script>
