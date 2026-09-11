<!-- 共享按钮：Modal footer 与通用操作按钮，统一消费 ui tokens，避免各 dialog 复制按钮样式。 -->
<template>
  <button class="base-button" :class="`base-button--${size}`" :type="type" :disabled="disabled">
    <slot />
  </button>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      /** 原生 button type。 */
      type?: 'button' | 'submit' | 'reset'
      /** 按钮尺寸：md 用于 Modal footer，sm 用于工具栏等紧凑场景。 */
      size?: 'md' | 'sm'
      /** 禁用态。 */
      disabled?: boolean
    }>(),
    {
      type: 'button',
      size: 'md',
      disabled: false,
    },
  )
</script>

<style scoped>
  .base-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 68px;
    height: 34px;
    padding: 0 16px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    color: var(--klc-color-ui-secondary-button-text);
    background: var(--klc-color-ui-input);
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease,
      opacity 0.15s ease;
  }

  .base-button--sm {
    min-width: 0;
    height: var(--base-button-height, 28px);
    padding: 0 10px;
    border-radius: 8px;
  }

  .base-button:hover:not(:disabled) {
    border-color: var(--klc-color-ui-border-strong);
    background: var(--klc-color-ui-hover);
  }

  .base-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
