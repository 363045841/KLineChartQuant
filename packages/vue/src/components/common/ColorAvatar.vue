<!-- 彩色圆形标识：统一尺寸、同色系底色与前景，插槽可放首字或图标。 -->
<template>
  <span class="color-avatar" :style="{ '--avatar-color': color }" aria-hidden="true">
    <slot />
  </span>
</template>

<script setup lang="ts">
  defineProps<{
    /** 由调用方提供主题 Token 颜色，组件只负责同色系的视觉呈现。 */
    color: string
  }>()
</script>

<style scoped>
  .color-avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--avatar-color) 22%, transparent);
    color: var(--avatar-color);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
</style>
