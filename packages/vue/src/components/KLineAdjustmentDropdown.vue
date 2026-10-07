<!-- 复权方式选择入口：按品种能力过滤复权选项，用 DropMenu 呈现当前值。 -->
<template>
  <DropMenu :label="TITLE" :groups="groups" density="compact" tooltip-placement="bottom" @select="select">
    <template #trigger>
      <span class="selection-menu__value">{{ selectedLabel }}</span>
      <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
    </template>
    <template #item-action="{ item }">
      <span v-if="item.id === selectedValue" class="drop-menu__status">
        <IconTablerCheck aria-hidden="true" />
      </span>
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import type { KLineAdjustment } from '@363045841yyt/klinechart-core/market-data'
  import { computed } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import DropMenu, { type DropMenuGroup } from './DropMenu.vue'

  export type { KLineAdjustment }

  const TITLE = '复权方式'
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

  const emit = defineEmits<{
    (e: 'update:modelValue', adjust: KLineAdjustment): void
  }>()

  /** 根据当前品种能力过滤复权选项；未提供能力时保持旧行为。 */
  const visibleOptions = computed(() => {
    if (!props.supportedAdjustments) return adjustmentOptions
    const supported = new Set(props.supportedAdjustments)
    return adjustmentOptions.filter((option) => supported.has(option.value))
  })

  const groups = computed<DropMenuGroup[]>(() => [
    {
      id: 'adjustment',
      label: TITLE,
      items: visibleOptions.value.map((option) => ({ id: option.value, label: option.label })),
    },
  ])

  /** 当前选中复权方式；非法或缺失值回退到首个可见选项。 */
  const selectedValue = computed(() => {
    const options = visibleOptions.value
    return options.find((option) => option.value === props.modelValue)?.value ?? options[0]?.value
  })

  const selectedLabel = computed(
    () => visibleOptions.value.find((option) => option.value === selectedValue.value)?.label ?? '',
  )

  /** 菜单选中后上报复权方式，值域由 visibleOptions 保证。 */
  function select(_groupId: string, itemId: string): void {
    emit('update:modelValue', itemId as KLineAdjustment)
  }
</script>

<style scoped src="./common/selection-menu.css"></style>
