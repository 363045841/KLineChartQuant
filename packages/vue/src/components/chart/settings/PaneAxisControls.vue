<!-- Pane 轴快捷入口直接消费 Core 已提交几何，不借用底部设置菜单定位。 -->
<template>
  <div
    class="pane-axis-controls"
    :data-pane-id="pane.id"
    :style="{ top: pane.top + 'px', height: pane.height + 'px', width: pane.axisWidth + 'px' }"
  >
    <div
      class="price-axis-shortcuts"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @click.stop
    >
      <BaseTooltip
        v-for="shortcut in shortcuts"
        :key="shortcut.on"
        :content="shortcut.label"
        placement="left"
        fill
      >
        <button
          type="button"
          :aria-label="shortcut.label"
          :aria-pressed="isShortcutSelected(shortcut)"
          @click="selectShortcut(shortcut)"
        >{{ shortcut.text }}</button>
      </BaseTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController, PaneGeometry } from '@363045841yyt/klinechart-core/controllers'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import { usePriceAxisMenu } from '@vue-src/composables/chart/usePriceAxisMenu.js'
  import { toRef } from 'vue'

  const props = defineProps<{
    controller: ChartController | null
    pane: PaneGeometry
  }>()
  const emit = defineEmits<{ 'settings-change': [settings: ChartSettings] }>()
  const { shortcuts, selectShortcut, isShortcutSelected } = usePriceAxisMenu(
    toRef(() => props.controller),
    (settings) => emit('settings-change', settings),
    props.pane.id,
  )
</script>

<style scoped>
  .pane-axis-controls {
    position: absolute;
    left: 0;
    z-index: 2;
  }

  .price-axis-shortcuts {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    visibility: hidden;
    pointer-events: none;
  }

  .pane-axis-controls:hover .price-axis-shortcuts,
  .pane-axis-controls:focus-within .price-axis-shortcuts {
    visibility: visible;
    pointer-events: auto;
  }

  .price-axis-shortcuts button {
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    color: var(--klc-color-ui-muted);
    background: var(--klc-color-ui-background);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .price-axis-shortcuts button:hover,
  .price-axis-shortcuts button:focus-visible {
    outline: none;
    background: var(--klc-color-ui-hover);
  }

  .price-axis-shortcuts button[aria-pressed='true'] {
    background: var(--klc-color-ui-border);
  }

  .price-axis-shortcuts button[aria-pressed='true']:hover {
    background: var(--klc-color-ui-border-strong);
  }
</style>
