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
    <Dropdown
      v-else-if="type === 'select' && options"
      :model-value="String(value)"
      :options="options"
      size="sm"
      min-width="100px"
      @update:model-value="emit('update', $event)"
    />
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
  import Dropdown from '@vue-src/components/common/Dropdown.vue'
  import ToggleSwitch from '@vue-src/components/common/ToggleSwitch.vue'

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
<style scoped>
  .settings-number {
    width: 100px;
  }
</style>
