<!--
  图表设置的单行：左侧标签 + 右侧布尔开关或下拉选择。
  选项由调用方解析后传入，本组件只负责按类型渲染控件并回传新值。
-->
<template>
  <div class="settings-item">
    <span>{{ label }}</span>
    <ToggleSwitch
      v-if="type === 'boolean'"
      :model-value="Boolean(value)"
      :aria-label="label"
      @update:model-value="emit('update', $event)"
    />
    <DropMenu
      v-else-if="type === 'select' && options"
      class="settings-select"
      :label="label"
      :groups="groups"
      density="compact"
      @select="(_groupId, value) => emit('update', value)"
    >
      <template #trigger>
        <span class="selection-menu__value">{{ selectedLabel }}</span>
        <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
      </template>
    </DropMenu>
    <input
      v-else-if="type === 'number'"
      type="number"
      class="form-control settings-number"
      :aria-label="label"
      :value="value"
      :min="min"
      :max="max"
      :step="step"
      @change="onNumberChange"
    />
  </div>
</template>

<script setup lang="ts">
  import type { SettingItem } from '@363045841yyt/klinechart-core/config'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import ToggleSwitch from '@vue-src/components/common/ToggleSwitch.vue'
  import { computed } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'

  const props = defineProps<{
    /** 设置项标签。 */
    label: string
    /** 控件类型。 */
    type: SettingItem['type']
    /** 当前值。 */
    value: unknown
    /** select 类型的选项。 */
    options?: SettingItem['options']
    min?: number
    max?: number
    step?: number
  }>()

  const emit = defineEmits<{ update: [value: string | boolean | number] }>()

  const selectedLabel = computed(
    () => props.options?.find((option) => option.value === String(props.value))?.label,
  )
  const groups = computed<ReadonlyArray<DropMenuGroup>>(() =>
    props.options
      ? [
          {
            id: props.label,
            label: '',
            items: props.options.map((option) => ({
              id: option.value,
              label: option.label,
              active: option.value === String(props.value),
            })),
          },
        ]
      : [],
  )

  /** 数值设置通过原生约束校验后提交，空值和越界输入恢复为当前草稿。 */
  function onNumberChange(event: Event): void {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    if (!input.validity.valid || !Number.isFinite(input.valueAsNumber)) {
      input.value = String(props.value)
      return
    }
    emit('update', input.valueAsNumber)
  }
</script>

<style scoped src="../../common/settings-item.css"></style>
<style scoped src="../../common/form-control.css"></style>
<style scoped src="../../common/selection-menu.css"></style>
<style scoped>
  .settings-number {
    width: 100px;
    height: 24px;
    padding: 0 10px;
    border-radius: 4px;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  /* 隐藏浏览器原生增减按钮，数值约束仍由 number 输入框校验。 */
  .settings-number::-webkit-inner-spin-button,
  .settings-number::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
</style>
