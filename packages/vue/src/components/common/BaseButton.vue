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
      /** 操作层级：default / primary 为文字按钮；outline 为卡片内的次级描边按钮。 */
      variant?: 'default' | 'primary' | 'outline'
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
  /* 默认外观保持无层：宿主 reset 必须是零特异性 :where()，组件类才能压过它；不要改回 @layer。 */
  .base-button {
    /* 行内留白同时决定 Footer 下划线的宽度，两者共用同一个值。 */
    --base-button-inline-padding: var(--klc-space-8, 8px);
    box-sizing: border-box;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: var(--klc-space-4, 4px);
    min-width: 0;
    height: var(--base-button-height, 28px);
    padding: 0 var(--base-button-inline-padding);
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
      background var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      border-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .base-button--sm {
    height: var(--base-button-height, 24px);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .base-button--primary {
    color: var(--klc-color-ui-text);
    font-weight: 500;
  }

  /* 描边变体：用于卡片内的次级操作，颜色由 --base-button-* 变量提供。 */
  .base-button--outline {
    gap: var(--base-button-gap, var(--klc-space-4, 4px));
    border-color: var(--base-button-border-color, var(--klc-color-ui-border));
    background: var(--base-button-background, var(--klc-color-ui-control-background));
    color: var(--base-button-color, var(--klc-color-ui-text));
    font-size: var(--base-button-font-size, var(--klc-text-12-font-size, 12px));
  }

  @media (hover: hover) and (pointer: fine) {
    .base-button:hover:not(:disabled) {
      background: var(--base-button-hover-background, var(--klc-color-ui-hover));
      color: var(--klc-color-ui-text);
    }
  }

  .base-button:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }

  .base-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

</style>
