<template>
  <div v-if="tabs.length > 0" class="source-tabs" role="tablist" aria-label="聚合源">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="source-tabs__tab"
      :class="{ 'is-active': modelValue === tab.key }"
      role="tab"
      :aria-selected="modelValue === tab.key"
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
  /** 搜索弹层顶部的聚合源 Tabs，视觉参考 Ant Design line Tabs */
  export type AggregationSourceTabKey = 'all' | string

  export interface AggregationSourceTabItem {
    key: AggregationSourceTabKey
    label: string
  }

  defineProps<{
    modelValue: AggregationSourceTabKey
    tabs: ReadonlyArray<AggregationSourceTabItem>
  }>()

  const emit = defineEmits<{
    'update:modelValue': [key: AggregationSourceTabKey]
  }>()
</script>

<style scoped>
  .source-tabs {
    display: flex;
    flex-wrap: nowrap;
    gap: 0;
    margin: 0 -4px;
    padding: 0 4px;
    overflow-x: auto;
    overflow-y: hidden;
    border-bottom: 1px solid var(--klc-color-border-button);
    scrollbar-width: none;
  }

  .source-tabs::-webkit-scrollbar {
    display: none;
  }

  .source-tabs__tab {
    position: relative;
    flex: 0 0 auto;
    height: 32px;
    padding: 0 12px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--klc-color-axis-text);
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    line-height: 32px;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  }

  .source-tabs__tab:hover {
    color: var(--klc-color-primary, #1677ff);
  }

  .source-tabs__tab.is-active {
    color: var(--klc-color-primary, #1677ff);
    font-weight: 500;
  }

  /* Ant Design ink-bar：选中项底部指示条 */
  .source-tabs__tab.is-active::after {
    content: '';
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 0;
    height: 2px;
    border-radius: 1px 1px 0 0;
    background: var(--klc-color-primary, #1677ff);
  }
</style>
