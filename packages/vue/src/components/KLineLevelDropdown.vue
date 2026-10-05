<!-- K 线级别选择入口：按品种能力过滤周期档位，用 DropMenu 呈现当前值。 -->
<template>
  <DropMenu :label="TITLE" :groups="groups" tooltip-placement="bottom" @select="select">
    <template #trigger>
      <span class="selection-menu__value">{{ selectedLabel }}</span>
      <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
    </template>
    <template #item-action="{ item }">
      <span v-if="item.id === selectedValue" class="selection-menu__check">
        <IconTablerCheck aria-hidden="true" />
      </span>
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import DropMenu, { type DropMenuGroup } from './DropMenu.vue'
  import { K_LINE_LEVEL_OPTIONS, type KLineLevel } from './kLineLevel'

  const TITLE = 'K线级别'

  const props = defineProps<{
    modelValue?: string
    supportedLevels?: ReadonlyArray<KLineLevel>
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', level: KLineLevel): void
  }>()

  /** 根据当前品种能力过滤周期选项；未提供能力时保持旧行为。 */
  const visibleOptions = computed(() => {
    if (!props.supportedLevels) return [...K_LINE_LEVEL_OPTIONS]
    const supported = new Set(props.supportedLevels)
    return K_LINE_LEVEL_OPTIONS.filter((option) => supported.has(option.value))
  })

  const groups = computed<DropMenuGroup[]>(() => [
    {
      id: 'level',
      label: TITLE,
      items: visibleOptions.value.map((option) => ({ id: option.value, label: option.label })),
    },
  ])

  /** 当前选中档位；非法或缺失值回退到首个可见选项。 */
  const selectedValue = computed(() => {
    const options = visibleOptions.value
    return options.find((option) => option.value === props.modelValue)?.value ?? options[0]?.value
  })

  const selectedLabel = computed(
    () => visibleOptions.value.find((option) => option.value === selectedValue.value)?.label ?? '',
  )

  /** 菜单选中后上报档位，值域由 visibleOptions 保证。 */
  function select(_groupId: string, itemId: string): void {
    emit('update:modelValue', itemId as KLineLevel)
  }
</script>

<style scoped src="./common/selection-menu.css"></style>
