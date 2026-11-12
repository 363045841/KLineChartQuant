<!-- 弹窗列表滚动区：占满正文剩余高度，内容层不加横向留白，行元素消费弹窗 inset。 -->
<template>
  <OverlayScrollArea class="modal-scroll-area">
    <slot />
  </OverlayScrollArea>
</template>

<script setup lang="ts">
  import OverlayScrollArea from './OverlayScrollArea.vue'
</script>

<style scoped>
  .modal-scroll-area {
    flex: 1;
    min-height: 0;
  }
</style>
