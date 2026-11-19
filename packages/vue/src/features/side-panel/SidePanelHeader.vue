<!-- 侧边面板公共标题行：与 TopToolbar 共用高度，分组页签放在标题行之后。 -->
<template>
  <header class="side-panel-header">
    <div class="side-panel-header__content">
      <slot>
        <h2 class="side-panel-header__title">{{ title }}</h2>
        <span v-if="count !== undefined && count > 0" class="side-panel-header__count">{{ count }}</span>
      </slot>
    </div>
    <div v-if="$slots.actions" class="side-panel-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
  defineProps<{ title?: string; count?: number }>()
</script>

<style scoped>
  .side-panel-header {
    flex: 0 0 auto;
    box-sizing: border-box;
    height: var(--klc-density-comfortable, 40px);
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    padding: 0 var(--klc-space-12, 12px);
    background: var(--klc-color-ui-surround-background);
  }

  .side-panel-header__title {
    margin: 0;
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-14-font-size, 14px);
    line-height: 20px;
  }

  .side-panel-header__content {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
  }

  .side-panel-header__actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--klc-space-2, 2px);
  }

  .side-panel-header__count {
    min-width: 18px;
    padding: 0 var(--klc-space-4, 4px);
    border-radius: var(--klc-radius-full, 9999px);
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-label-12-font-size);
    line-height: 16px;
    text-align: center;
  }
</style>
