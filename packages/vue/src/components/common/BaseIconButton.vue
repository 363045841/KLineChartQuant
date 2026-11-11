<!--
  图标按钮原语：统一命中区、hover、危险色与键盘焦点，图标只从默认插槽传入。
  列表行、工具栏、弹窗头部等需要单图标操作的地方都用它，不再各写一套 24/26/28px 按钮。
-->
<template>
  <button
    type="button"
    class="base-icon-button"
    :class="[
      `base-icon-button--${size}`,
      { 'base-icon-button--danger': tone === 'danger', 'base-icon-button--circle': shape === 'circle' },
    ]"
    :aria-label="label"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      /** 可访问名称；图标按钮必须提供。 */
      label: string
      /** 命中区尺寸：16 / 20 / 24 / 28px。 */
      size?: 'xs' | 'sm' | 'md' | 'lg'
      /** 危险操作用红色 hover。 */
      tone?: 'default' | 'danger'
      /** 外形；circle 用于发送按钮等圆形操作。 */
      shape?: 'square' | 'circle'
      disabled?: boolean
    }>(),
    { size: 'md', tone: 'default', shape: 'square', disabled: false },
  )
</script>

<style scoped>
  .base-icon-button {
    --base-icon-button-size: var(--klc-space-24, 24px);

    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    flex: 0 0 auto;
    width: var(--base-icon-button-size);
    height: var(--base-icon-button-size);
    padding: 0;
    border: 0;
    border-radius: var(--base-icon-button-radius, var(--klc-radius-xs, 4px));
    background: var(--base-icon-button-background, transparent);
    color: var(--base-icon-button-color, var(--klc-color-ui-muted));
    cursor: pointer;
    transition:
      color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      background-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .base-icon-button--circle {
    border-radius: var(--klc-radius-full, 9999px);
  }

  .base-icon-button--xs {
    --base-icon-button-size: var(--klc-space-16, 16px);
  }

  .base-icon-button--sm {
    --base-icon-button-size: calc(var(--klc-space-16, 16px) + var(--klc-space-4, 4px));
  }

  .base-icon-button--lg {
    --base-icon-button-size: calc(var(--klc-space-24, 24px) + var(--klc-space-4, 4px));
  }

  .base-icon-button:hover:not(:disabled),
  .base-icon-button:focus-visible {
    background: var(--base-icon-button-hover-bg, var(--klc-color-ui-hover));
    color: var(--base-icon-button-hover-color, var(--klc-color-ui-text));
  }

  .base-icon-button--danger:hover:not(:disabled),
  .base-icon-button--danger:focus-visible {
    color: var(--base-icon-button-danger-color, var(--klc-color-ui-danger));
  }

  .base-icon-button:focus-visible {
    outline: 2px solid var(--klc-color-ui-text);
    outline-offset: -2px;
  }

  .base-icon-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .base-icon-button :slotted(svg) {
    width: var(--base-icon-button-icon-size, 16px);
    height: var(--base-icon-button-icon-size, 16px);
  }
</style>
