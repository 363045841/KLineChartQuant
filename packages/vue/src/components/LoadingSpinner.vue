<!-- 本组件提供与 Symbol 选择器一致的旋转加载圈。 -->
<template>
  <span class="loading-spinner" aria-hidden="true" />
</template>

<style scoped>
  .loading-spinner {
    display: inline-block;
    flex-shrink: 0;
    width: 12px;
    height: 12px;
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
