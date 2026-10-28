<!-- 文件目录与标签页共用的未保存标记，不依赖字符或字体。 -->
<template>
  <span class="script-dirty-indicator" role="img" aria-label="未保存" />
</template>

<style scoped>
  .script-dirty-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--klc-brand-accent-text);
  }
</style>
