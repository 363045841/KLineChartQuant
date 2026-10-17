<!-- 本组件提供与 Symbol 选择器一致的旋转加载圈；size 控制外径（px）。 -->
<template>
  <span
    class="loading-spinner"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      /** 加载圈外径（px），默认 12 与内联小场景一致。 */
      size?: number
    }>(),
    { size: 12 },
  )
</script>

<style scoped>
  .loading-spinner {
    display: inline-block;
    flex-shrink: 0;
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: loading-spinner-spin 0.6s linear infinite;
  }

  @keyframes loading-spinner-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
      animation: none;
    }
  }
</style>
