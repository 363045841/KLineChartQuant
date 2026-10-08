<!-- K 线形态选择：选项复用 Core 设置定义，状态由图表设置提供。 -->
<template>
  <DropMenu label="K 线形态" :groups="groups" density="compact" tooltip-placement="bottom" @select="select">
    <template #trigger>
      <span class="selection-menu__value">{{ selectedLabel }}</span>
      <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
    </template>
    <template #item-action="{ item }">
      <span v-if="item.id === modelValue" class="drop-menu__status">
        <IconTablerCheck aria-hidden="true" />
      </span>
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import { type ChartSettings, DEFAULT_SETTINGS } from '@363045841yyt/klinechart-core/config'
  import { computed } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import DropMenu, { type DropMenuGroup } from './DropMenu.vue'

  type KLineShape = NonNullable<ChartSettings['klineShape']>
  const props = withDefaults(defineProps<{ modelValue?: KLineShape }>(), {
    modelValue: 'candlestick',
  })
  const emit = defineEmits<{ 'update:modelValue': [shape: KLineShape] }>()
  const options = DEFAULT_SETTINGS.find((setting) => setting.key === 'klineShape')!.options
  const groups: DropMenuGroup[] = [
    {
      id: 'klineShape',
      label: 'K 线形态',
      items: options.map((option) => ({ id: option.value, label: option.label })),
    },
  ]
  const selectedLabel = computed(
    () => options.find((option) => option.value === props.modelValue)?.label,
  )
  function select(_groupId: string, itemId: string): void {
    const option = options.find((option) => option.value === itemId)
    if (option) emit('update:modelValue', option.value)
  }
</script>

<style scoped src="./common/selection-menu.css"></style>
