<!--
  Canvas 浮动工具栏容器：只提供外壳、滚动与拖拽拦截。
  按钮外观由 toolbar-button.css 的 .toolbar-btn 提供，消费方不再依赖穿透样式。
-->
<template>
  <div class="canvas-toolbar" @pointerdown.stop @pointermove.stop @pointerup.stop>
    <slot />
  </div>
</template>

<script setup lang="ts">
  import './toolbar-button.css'
</script>

<style scoped>
  .canvas-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: color-mix(in srgb, var(--klc-color-ui-surface) 92%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.08),
      0 1px 2px rgba(0, 0, 0, 0.04);
    user-select: none;
    pointer-events: auto;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .canvas-toolbar::-webkit-scrollbar {
    display: none;
  }
</style>
