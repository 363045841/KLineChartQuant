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
    height: calc(18px + 2 * var(--klc-spacing-sm));
    padding: 0 var(--klc-spacing-lg);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    font-family: var(--klc-typography-font-family);
    font-size: calc(var(--klc-typography-font-size-md) + 1px);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    color: var(--klc-color-ui-secondary-button-text);
    background: var(--klc-color-ui-input);
    transition:
      background var(--klc-motion-duration-fast) ease,
      color var(--klc-motion-duration-fast) ease,
      border-color var(--klc-motion-duration-fast) ease,
      opacity var(--klc-motion-duration-fast) ease;
  }

  .base-button--sm {
    min-width: 0;
    height: var(--base-button-height, calc(12px + 2 * var(--klc-spacing-sm)));
    padding: 0 calc(var(--klc-spacing-sm) + 2px);
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
