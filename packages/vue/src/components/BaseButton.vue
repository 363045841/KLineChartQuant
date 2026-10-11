<!-- 共享按钮：Modal footer 与通用操作按钮，统一消费 ui tokens，避免各 dialog 复制按钮样式。 -->
<template>
  <button
    class="base-button"
    :class="[`base-button--${size}`, `base-button--${variant}`]"
    :type="type"
    :disabled="disabled"
  >
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
      /** 操作层级：均使用文字按钮，主要操作通过文字颜色与字重强调。 */
      variant?: 'default' | 'primary'
      /** 禁用态。 */
      disabled?: boolean
    }>(),
    {
      type: 'button',
      size: 'md',
      variant: 'default',
      disabled: false,
    },
  )
</script>

<style scoped>
  .base-button {
    box-sizing: border-box;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: var(--klc-space-4, 4px);
    min-width: 0;
    height: var(--base-button-height, 28px);
    padding: 0 var(--klc-space-8, 8px);
    border: 1px solid transparent;
    border-radius: var(--klc-radius-xs, 4px);
    font-family: var(--klc-typography-font-family);
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: 400;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    color: var(--klc-color-ui-muted);
    background: transparent;
    transition:
      background var(--klc-motion-dur-fast, 160ms) ease,
      color var(--klc-motion-dur-fast, 160ms) ease,
      border-color var(--klc-motion-dur-fast, 160ms) ease;
  }

  .base-button--sm {
    height: var(--base-button-height, 24px);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .base-button--primary {
    color: var(--klc-color-ui-text);
    font-weight: 500;
  }

  .base-button:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .base-button:focus-visible {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: 2px;
  }

  .base-button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
