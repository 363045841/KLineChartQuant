<!-- K 线形态选择：选项复用 Core 设置定义，状态由图表设置提供；不支持的形态由能力置灰。 -->
<template>
  <DropMenu :label="settingLabel" :groups="groups" density="compact" tooltip-placement="bottom" @select="select">
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
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import { computed } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'

  type KLineShape = NonNullable<ChartSettings['klineShape']>
  const props = withDefaults(
    defineProps<{
      modelValue?: KLineShape
      /** 当前品种不支持、需要置灰的形态值（如缺少原始逐笔成交时的足迹图）。 */
      disabledValues?: readonly string[]
    }>(),
    {
      modelValue: 'candlestick',
      disabledValues: () => [],
    },
  )
  const emit = defineEmits<{ 'update:modelValue': [shape: KLineShape] }>()

  // Core 设置 key；分组标题与触发器提示都取自该定义，避免与 Core 文案重复维护。
  const KLINE_SHAPE_SETTING_KEY = 'klineShape'
  const klineShapeSetting = DEFAULT_SETTINGS.find(
    (setting) => setting.key === KLINE_SHAPE_SETTING_KEY,
  )
  // Core 未注册该设置时保持空态，不以非空断言掩盖契约漂移。
  const settingLabel = klineShapeSetting?.label ?? ''
  const options = klineShapeSetting?.options ?? []
  // 能力变化（切换品种）后置灰状态必须跟着更新，故不缓存为普通数组。
  const groups = computed<DropMenuGroup[]>(() => [
    {
      id: KLINE_SHAPE_SETTING_KEY,
      label: settingLabel,
      items: options.map((option) => ({
        id: option.value,
        label: option.label,
        disabled: props.disabledValues.includes(option.value),
      })),
    },
  ])
  const selectedLabel = computed(
    () => options.find((option) => option.value === props.modelValue)?.label,
  )
  function select(_groupId: string, itemId: string): void {
    const option = options.find((option) => option.value === itemId)
    if (option) emit('update:modelValue', option.value)
  }
</script>

<style scoped src="../common/selection-menu.css"></style>
