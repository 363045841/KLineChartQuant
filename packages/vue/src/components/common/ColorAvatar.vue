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
      /** default 用同色系淡底；contrast 为实心反色标记，用于应用图标。 */
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

  /*
   * 应用图标：实心绿底 + 白色折线，不掺透明度。
   * 浅色 #2E6B3A（白线 8.4:1），深色 #35784A（白线 5.4:1）；叶绿色相避开行情青绿与 success。
   */
  .color-avatar--contrast {
    background: var(--klc-color-ui-brand-surface);
    color: var(--klc-color-ui-brand-on);
  }
</style>
