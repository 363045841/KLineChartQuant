<template>
  <section class="collapsible-section">
    <button
      type="button"
      class="collapsible-section__header"
      :aria-expanded="expanded"
      @click="emit('toggle')"
    >
      <span class="collapsible-section__label">
        <slot name="label">{{ label }}</slot>
      </span>
      <svg
        class="collapsible-section__chevron"
        :class="{ 'is-expanded': expanded }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        width="14"
        height="14"
        aria-hidden="true"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
    <div v-show="expanded" class="collapsible-section__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
  /**
   * 可折叠分区
   * 与图表设置同一套 header / chevron / body 视觉
   */
  defineProps<{
    /** 是否展开 */
    expanded: boolean
    /** 标题文案；也可用 #label 插槽 */
    label?: string
  }>()

  const emit = defineEmits<{
    toggle: []
  }>()
</script>

<style scoped>
  .collapsible-section {
    display: flex;
    flex-direction: column;
  }

  .collapsible-section + .collapsible-section {
    margin-top: 4px;
  }

  .collapsible-section__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    margin: 0;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .collapsible-section__header:hover {
    background: var(--klc-color-tag-bg-hover);
  }

  .collapsible-section__label {
    font-size: 12px;
    color: var(--klc-color-axis-text);
    font-weight: 500;
    white-space: nowrap;
    line-height: 1;
    letter-spacing: 0.3px;
  }

  .collapsible-section__chevron {
    flex-shrink: 0;
    color: var(--klc-color-axis-text);
    transform: rotate(0deg);
    transition:
      transform 0.15s ease,
      color 0.15s ease;
  }

  .collapsible-section__chevron.is-expanded {
    transform: rotate(90deg);
  }

  .collapsible-section__header:hover .collapsible-section__chevron {
    color: var(--klc-color-foreground);
  }

  .collapsible-section__body {
    display: flex;
    flex-direction: column;
  }
</style>
