<!--
  图表设置的导航行：左侧标签 + 右侧箭头，整行可点击。
  点击后由调用方打开对应的子面板。
-->
<template>
  <button type="button" class="settings-item nav-item" @click="emit('select')">
    <span><slot /></span>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      width="16"
      height="16"
      class="nav-arrow"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  </button>
</template>

<script setup lang="ts">
  const emit = defineEmits<{ select: [] }>()
</script>

<style scoped src="../../common/settings-item.css"></style>

<style scoped>
  /* 导航项交互优化 */
  .settings-item.nav-item {
    width: 100%;
    border: 0;
    background: transparent;
    text-align: start;
    cursor: pointer;
  }

  .settings-item.nav-item:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .settings-item.nav-item:hover {
      background-color: var(--klc-color-ui-hover);
    }
    .nav-item:hover .nav-arrow {
      transform: translateX(2px);
    }
  }

  .nav-arrow {
    color: var(--klc-color-ui-muted);
    transition: transform var(--klc-motion-duration-fast) ease;
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-item,
    .nav-arrow {
      transition: none;
    }
  }
</style>
