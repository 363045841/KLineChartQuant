<template>
  <div class="top-toolbar">
    <!-- 占位，后续填充功能按钮 -->
  </div>
</template>

<script setup lang="ts">
// 后续填充逻辑
</script>

<style scoped>
.top-toolbar {
  width: 95%;
  height: 40px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--klc-color-border-chart);
  border-radius: 3px;
  background: var(--klc-color-background);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  user-select: none;
}

@media (max-width: 768px), (max-height: 640px) {
  .top-toolbar {
    height: 36px;
    padding: 0 6px;
    border-radius: 3px;
  }
}
</style>
