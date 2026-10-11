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
  </div>
</template>

<script setup lang="ts">
  import type { SettingItem } from '@363045841yyt/klinechart-core/config'
  import ToggleSwitch from '../common/ToggleSwitch.vue'
  import Dropdown from '../Dropdown.vue'

  defineProps<{
    /** 设置项标签。 */
    label: string
    /** 控件类型。 */
    type: SettingItem['type']
    /** 当前值。 */
    value: unknown
    /** select 类型的选项。 */
    options?: SettingItem['options']
  }>()

  const emit = defineEmits<{ update: [value: string | boolean] }>()
</script>

<style scoped src="../common/settings-item.css"></style>
