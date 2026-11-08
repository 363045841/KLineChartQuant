<!-- 绘图样式控件：颜色、线宽与线型；只消费 Core 确认的可编辑字段。 -->
<template>
  <BaseTooltip v-if="style && canEdit('stroke')" content="颜色" placement="top" trigger-display="contents">
    <ColorPicker label="颜色" :model-value="style.stroke" @update:model-value="onColorChange" />
  </BaseTooltip>

  <BaseTooltip v-if="canEdit('strokeWidth')" content="线宽" placement="top" trigger-display="contents">
    <DropMenu
      label="线宽"
      :groups="widthGroups"
      density="compact"
      trigger-class="control-button--sm"
      @select="(_groupId, value) => onWidthChange(Number(value))"
    >
      <template #trigger>
        <span class="selection-menu__value">{{ style?.strokeWidth ?? 1 }}px</span>
        <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
      </template>
    </DropMenu>
  </BaseTooltip>

  <BaseTooltip v-if="canEdit('strokeStyle')" content="线型" placement="top" trigger-display="contents">
    <DropMenu
      label="线型"
      :groups="styleGroups"
      density="compact"
      trigger-class="control-button--sm"
      @select="selectLineStyle"
    >
      <template #trigger>
        <span class="selection-menu__value">{{ selectedStyleLabel }}</span>
        <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
      </template>
    </DropMenu>
  </BaseTooltip>
</template>

<script setup lang="ts">
  import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
  import ColorPicker from '@vue-src/components/color/impl/ColorPicker.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import { computed } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'

  const props = defineProps<{
    drawings: ReadonlyArray<DrawingObject>
    editableStyleKeys: ReadonlyArray<keyof DrawingStyle>
  }>()

  const emit = defineEmits<{
    (e: 'updateStyle', style: Partial<DrawingStyle>): void
  }>()

  const widthOptions = [
    { label: '1px', value: '1' },
    { label: '2px', value: '2' },
    { label: '3px', value: '3' },
    { label: '4px', value: '4' },
  ]

  const styleOptions = [
    { label: '实线', value: 'solid' },
    { label: '虚线', value: 'dashed' },
    { label: '点线', value: 'dotted' },
  ] as const

  /** 批量编辑展示首个图元的当前值；写入仅限 Core 确认的字段交集。 */
  const style = computed(() => props.drawings[0]?.style ?? null)

  const widthGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'width',
      label: '',
      items: widthOptions.map((option) => ({
        id: option.value,
        label: option.label,
        active: Number(option.value) === (style.value?.strokeWidth ?? 1),
      })),
    },
  ])

  const styleGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'style',
      label: '',
      items: styleOptions.map((option) => ({
        id: option.value,
        label: option.label,
        active: option.value === (style.value?.strokeStyle ?? 'solid'),
      })),
    },
  ])

  const selectedStyleLabel = computed(
    () =>
      styleOptions.find((option) => option.value === (style.value?.strokeStyle ?? 'solid'))?.label,
  )

  /** 从菜单选项中解析线型，再提交类型明确的样式变更。 */
  function selectLineStyle(_groupId: string, value: string): void {
    const option = styleOptions.find((option) => option.value === value)
    if (option) onLineStyleChange(option.value)
  }

  function canEdit(key: keyof DrawingStyle): boolean {
    return props.editableStyleKeys.includes(key)
  }

  function onColorChange(color: string) {
    emit('updateStyle', { stroke: color })
  }

  function onWidthChange(width: number) {
    emit('updateStyle', { strokeWidth: width })
  }

  function onLineStyleChange(style: 'solid' | 'dashed' | 'dotted') {
    emit('updateStyle', { strokeStyle: style })
  }
</script>

<style scoped src="../common/selection-menu.css"></style>
