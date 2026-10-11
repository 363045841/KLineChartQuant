<!-- 预警条件的「方向」按钮组：图标 + 文案的互斥选择，供穿越/交叉类条件复用。 -->
<template>
  <div class="rule-form-directions">
    <button
      v-for="direction in directions"
      :key="direction.value"
      type="button"
      class="rule-form-direction"
      :class="{ active: direction.value === modelValue }"
      @click="emit('update:modelValue', direction.value)"
    >
      <component :is="direction.icon" class="rule-form-direction-icon" aria-hidden="true" />
      {{ direction.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
  import type { Component } from 'vue'

  defineProps<{
    /** 当前选中的方向值。 */
    modelValue: T
    /** 可选方向；顺序即渲染顺序。 */
    directions: ReadonlyArray<{ value: T; label: string; icon: Component }>
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: T]
  }>()
</script>

<style scoped>
  .rule-form-directions {
    display: flex;
    gap: 4px;
  }

  .rule-form-direction {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
  }

  .rule-form-direction-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .rule-form-direction:hover:not(.active) {
    border-color: var(--klc-color-ui-border-strong);
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .rule-form-direction.active {
    background: var(--klc-color-ui-accent);
    color: var(--klc-color-ui-on-accent);
    border-color: var(--klc-color-ui-accent);
  }
</style>
