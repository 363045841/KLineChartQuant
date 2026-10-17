<!-- 分段式切换标签：强调色滑块跟随选中项移动，供弹窗内视图切换复用。 -->
<template>
  <div
    class="segmented-tabs"
    role="tablist"
    :aria-label="ariaLabel"
    :style="{
      '--segmented-tabs-index': activeIndex,
      '--segmented-tabs-count': tabs.length,
    }"
  >
    <span class="segmented-tabs__thumb" aria-hidden="true"></span>
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      class="segmented-tab"
      :class="{ active: tab.value === modelValue }"
      role="tab"
      :aria-selected="tab.value === modelValue"
      @click="emit('update:modelValue', tab.value)"
    >
      <slot name="tab" :tab="tab" :active="tab.value === modelValue">{{ tab.label }}</slot>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
  import { computed } from 'vue'

  const props = defineProps<{
    modelValue: T
    tabs: ReadonlyArray<{ value: T; label: string }>
    ariaLabel?: string
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: T]
  }>()

  /** 当前选中项下标，供滑块定位；未匹配时回退到首项。 */
  const activeIndex = computed(() =>
    Math.max(
      0,
      props.tabs.findIndex((tab) => tab.value === props.modelValue),
    ),
  )
</script>

<style scoped>
  .segmented-tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--segmented-tabs-count), minmax(64px, 1fr));
    flex: 0 0 auto;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-hover);
  }

  .segmented-tabs__thumb {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: calc(100% / var(--segmented-tabs-count));
    border-radius: 7px;
    background: var(--klc-color-ui-accent);
    transform: translateX(calc(var(--segmented-tabs-index) * 100%));
    transition: transform 0.2s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .segmented-tabs__thumb {
      transition: none;
    }
  }

  .segmented-tab {
    position: relative;
    z-index: 1;
    height: 32px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s ease;
  }

  .segmented-tab:hover {
    color: var(--klc-color-ui-text);
  }

  .segmented-tab.active {
    color: var(--klc-color-ui-on-accent);
    font-weight: 600;
  }

  .segmented-tab:focus-visible {
    outline: 2px solid var(--klc-color-ui-text);
    outline-offset: -2px;
  }
</style>
