<!-- 单个设置行：按 SettingItem 元数据渲染控件，变更立即上报（无草稿）。 -->
<template>
  <div class="setting-row" :data-setting-key="item.key">
    <span class="setting-row__label">{{ item.label }}</span>
    <ToggleSwitch
      v-if="item.type === 'boolean'"
      :model-value="Boolean(value)"
      :aria-label="item.label"
      @update:model-value="emit('change', $event)"
    />
    <Dropdown
      v-else-if="item.type === 'select' && item.options"
      :model-value="String(value)"
      :options="options ?? item.options"
      :aria-label="item.label"
      size="sm"
      min-width="120px"
      @update:model-value="emit('change', $event)"
    />
  </div>
</template>

<script setup lang="ts">
  import type { SettingItem } from '@363045841yyt/klinechart-core/config'
  import ToggleSwitch from '../common/ToggleSwitch.vue'
  import Dropdown from '../Dropdown.vue'

  defineProps<{
    item: SettingItem
    value: unknown
    /** 覆盖下拉选项文案（如本地时区后缀）。 */
    options?: { value: string; label: string }[]
  }>()
  const emit = defineEmits<{ change: [value: unknown] }>()
</script>

<style scoped>
  .setting-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    min-block-size: 40px;
    padding: var(--klc-spacing-sm);
    border-radius: 6px;
  }

  .setting-row__label {
    min-inline-size: 0;
    line-height: var(--klc-typography-line-height-standard);
  }

  @media (max-width: 480px) {
    .setting-row {
      gap: var(--klc-spacing-sm);
    }
  }
</style>
