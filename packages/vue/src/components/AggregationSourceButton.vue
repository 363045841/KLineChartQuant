<template>
  <button
    type="button"
    class="source-button"
    title="管理聚合源"
    aria-label="管理聚合源"
    @click.stop="emit('click')"
  >
    <IconTablerAdjustmentsHorizontal aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
  import IconTablerAdjustmentsHorizontal from '~icons/tabler/adjustments-horizontal'

  const emit = defineEmits<{ click: [] }>()
</script>

<style scoped>
  .source-button {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .source-button:hover {
    background: var(--klc-color-ui-hover);
  }

  .source-button svg {
    width: 15px;
    height: 15px;
  }
</style>
