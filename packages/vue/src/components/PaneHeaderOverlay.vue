<template>
  <div class="pane-header-overlay" aria-label="指标面板管理">
    <div
      v-for="pane in panes"
      :key="pane.id"
      class="pane-close-control"
      :style="{ top: `${pane.top}px`, left: `${pane.anchorLeft}px` }"
    >
      <button
        class="pane-close-control__button"
        type="button"
        aria-label="上移指标"
        title="上移指标"
        :disabled="!pane.canMoveUp"
        @pointerdown.stop
        @click.stop="emit('move-up', pane.id)"
      >
        <IconTablerArrowUp aria-hidden="true" />
      </button>
      <button
        class="pane-close-control__button"
        type="button"
        aria-label="下移指标"
        title="下移指标"
        :disabled="!pane.canMoveDown"
        @pointerdown.stop
        @click.stop="emit('move-down', pane.id)"
      >
        <IconTablerArrowDown aria-hidden="true" />
      </button>
      <button
        class="pane-close-control__button"
        type="button"
        aria-label="更换指标"
        title="更换指标"
        @pointerdown.stop
        @click.stop="emit('replace', pane.id)"
      >
        <IconTablerRefresh aria-hidden="true" />
      </button>
      <button
        class="pane-close-control__button"
        type="button"
        aria-label="关闭指标"
        title="关闭指标"
        @pointerdown.stop
        @click.stop="emit('close', pane.id)"
      >
        <IconTablerX aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  /** PaneHeaderOverlay：在 Canvas 之上提供副图关闭入口。 */
  import IconTablerArrowDown from '~icons/tabler/arrow-down'
  import IconTablerArrowUp from '~icons/tabler/arrow-up'
  import IconTablerRefresh from '~icons/tabler/refresh'
  import IconTablerX from '~icons/tabler/x'

  defineProps<{
    panes: ReadonlyArray<{
      id: string
      top: number
      anchorLeft: number
      canMoveUp: boolean
      canMoveDown: boolean
    }>
  }>()

  const emit = defineEmits<{
    close: [paneId: string]
    replace: [paneId: string]
    'move-up': [paneId: string]
    'move-down': [paneId: string]
  }>()
</script>

<style scoped>
  .pane-header-overlay {
    position: absolute;
    inset: 0;
    z-index: 9;
    pointer-events: none;
  }

  .pane-close-control {
    position: absolute;
    display: flex;
    transform: translateX(-100%);
    overflow: hidden;
    border: 1px solid var(--klc-color-border-chart);
    border-radius: 6px;
    background: var(--klc-color-background);
    opacity: 0;
    pointer-events: auto;
    transition: opacity 120ms ease;
  }

  .pane-close-control:hover,
  .pane-close-control:focus-within {
    opacity: 1;
  }

  .pane-close-control__button {
    display: grid;
    width: 20px;
    height: 20px;
    padding: 2px;
    border: 0;
    place-items: center;
    color: var(--klc-color-foreground);
    background: transparent;
    cursor: pointer;
  }

  .pane-close-control__button:hover,
  .pane-close-control__button:focus-visible {
    background: color-mix(in srgb, var(--klc-color-foreground) 8%, transparent);
    outline: none;
  }

  .pane-close-control__button:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .pane-close-control__button:disabled:hover {
    background: transparent;
  }

  .pane-close-control__button + .pane-close-control__button {
    border-left: 1px solid var(--klc-color-border-chart);
  }

  .pane-close-control__button :deep(svg) {
    width: 14px;
    height: 14px;
  }
</style>
