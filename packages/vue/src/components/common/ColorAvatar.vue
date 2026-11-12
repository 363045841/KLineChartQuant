<!-- 彩色圆形标识：统一尺寸、同色系底色与前景，插槽可放首字或图标。 -->
<template>
  <span
    class="color-avatar"
    :class="`color-avatar--${variant}`"
    :style="{ '--avatar-color': color }"
    aria-hidden="true"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      /** 由调用方提供主题 Token 颜色，组件只负责同色系的视觉呈现。 */
      color: string
      /** 浅色用同色系；contrast 在深色下改用高对比反色。 */
      variant?: 'default' | 'contrast'
    }>(),
    { variant: 'default' },
  )
</script>

<style scoped>
  .color-avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--klc-radius-full, 9999px);
    background: color-mix(in srgb, var(--avatar-color) 22%, transparent);
    color: var(--avatar-color);
    font-size: var(--klc-text-11-mono-font-size, 11px);
    font-weight: var(--klc-typography-font-weight-bold, 700);
    line-height: 1;
  }

  /* 深色工作台下用高对比反色，浅色仍保留工作区标识色。 */
  .color-avatar--contrast {
    background: light-dark(
      color-mix(in srgb, var(--avatar-color) 22%, transparent),
      color-mix(in srgb, var(--klc-color-ui-text) 90%, var(--klc-color-ui-surface))
    );
    color: light-dark(var(--avatar-color), var(--klc-color-ui-background));
  }
</style>
