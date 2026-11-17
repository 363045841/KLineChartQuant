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
      /** 操作层级：default / primary / link 为文字按钮；outline 为卡片内的次级描边按钮。 */
      variant?: 'default' | 'primary' | 'link' | 'outline'
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
    /* 下划线与按钮下缘的距离；小尺寸按钮单独收窄，避免线贴到文字底边。 */
    --base-button-underline-offset: 5px;
    position: relative;
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
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: var(--klc-text-label-13-font-weight, 500);
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    color: var(--base-button-color, var(--klc-color-ui-muted));
    background: transparent;
    transition:
      background var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard),
      border-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .base-button--sm {
    --base-button-underline-offset: 3px;

    height: var(--base-button-height, 24px);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .base-button--primary {
    color: var(--klc-color-ui-text);
  }

  /*
    链接档：句子内的动作。蓝色文字、无内边距，下划线复用与 footer 相同的展开动画，
    hover 不变色也不加底色；只在真正像链接的位置使用（例如失败提示、表单内联操作）。
  */
  .base-button--link {
    /* 0px 而不是 0：无单位零会让 calc(100% - 2 * 0) 在计算值阶段非法。 */
    --base-button-inline-padding: 0px;
    --base-button-underline: '';
    --base-button-color: var(--klc-brand-accent-text);
    --base-button-hover-color: var(--klc-brand-accent-text);
    --base-button-hover-background: transparent;

    gap: 0;
  }

  /* 描边变体：用于卡片内的次级操作，颜色由 --base-button-* 变量提供。 */
  .base-button--outline {
    gap: var(--base-button-gap, var(--klc-space-4, 4px));
    border-color: var(--base-button-border-color, var(--klc-color-ui-border));
    background: var(--base-button-background, var(--klc-color-ui-control-background));
    color: var(--base-button-color, var(--klc-color-ui-text));
    font-size: var(--base-button-font-size, var(--klc-text-12-font-size, 12px));
  }

  /*
    文字动作下划线：默认不生成伪元素，Footer 这类容器用 --base-button-underline 打开。
    宽度用 width 展开而不是 scaleX：合成层回收时缩放会突然变细；
    宽度由控件自己的行内留白变量推导，换尺寸或响应式留白都不会和文字错位。
  */
  .base-button::after {
    content: var(--base-button-underline, none);
    position: absolute;
    left: 50%;
    bottom: var(--base-button-underline-offset);
    width: 0;
    height: 1px;
    background: currentColor;
    translate: -50% 0;
    transition: width var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .base-button:not(:disabled):hover::after,
  .base-button:not(:disabled):focus-visible::after {
    width: calc(100% - 2 * var(--base-button-inline-padding, 8px));
  }

  @media (hover: hover) and (pointer: fine) {
    .base-button:hover:not(:disabled) {
      background: var(--base-button-hover-background, var(--klc-color-ui-hover));
      color: var(--base-button-hover-color, var(--klc-color-ui-text));
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
