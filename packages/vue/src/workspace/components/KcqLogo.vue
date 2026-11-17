<!-- 品牌折线：与应用图标同源的通道轨迹，圆盘底色与尺寸由所在容器决定。 -->
<template>
  <svg
    class="kcq-logo"
    viewBox="0 0 256 256"
    :stroke-width="BRAND_MARK_STROKE_WIDTH"
    aria-hidden="true"
  >
    <path :d="BRAND_MARK_PATH" />
  </svg>
</template>

<script setup lang="ts">
  import { BRAND_MARK_PATH, BRAND_MARK_STROKE_WIDTH } from '../../brandMark.js'
</script>

<style scoped>
  .kcq-logo {
    display: block;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
