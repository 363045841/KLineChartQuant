<!-- Pane 轴控件分两层：快捷按钮在本 Pane 的绘图带内，设置入口贴轴列带底。 -->
<template>
  <div class="pane-axis-shortcuts-layer" :style="plotBandStyle">
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
  <div class="pane-axis-settings-layer" :style="columnBandStyle">
    <PaneAxisSettings
      v-for="column in columns"
      :key="column.axisId"
      :controller="controller"
      :axis-id="column.axisId"
      :style="columnStyle(column)"
      @settings-change="onSettingsChange"
    />
  </div>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController, PaneGeometry } from '@363045841yyt/klinechart-core/controllers'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import { usePriceAxisMenu } from '@vue-src/composables/chart/usePriceAxisMenu.js'
  import { computed, toRef } from 'vue'
  import PaneAxisSettings from './PaneAxisSettings.vue'

  const props = defineProps<{
    controller: ChartController | null
    pane: PaneGeometry
    /** 本 Pane 的轴列，每条轴一个设置入口。 */
    columns: PaneGeometry['axisColumns']
    /** 最后一条轴列没有下一个 Pane，带子直接延伸到图表底。 */
    endsAtChartBottom: boolean
  }>()
  const emit = defineEmits<{ 'settings-change': [settings: ChartSettings] }>()
  const { shortcuts, selectShortcut, isShortcutSelected } = usePriceAxisMenu(
    toRef(() => props.controller),
    (settings) => emit('settings-change', settings),
    () => props.columns[0]?.axisId,
  )

  /** 快捷按钮所在带子就是本 Pane 的绘图区，不进入底部时间轴那一行。 */
  const plotBandStyle = computed(() => ({
    top: `${props.pane.top}px`,
    height: `${props.pane.height}px`,
    width: `${props.pane.axisWidth}px`,
  }))

  /** 设置入口所在带子的下界是下一个 Pane 的顶，最后一个 Pane 直接到宿主底。 */
  const columnBandStyle = computed(() => ({
    top: `${props.pane.top}px`,
    width: `${props.pane.axisWidth}px`,
    ...(props.endsAtChartBottom ? { bottom: '0px' } : { height: `${props.pane.height}px` }),
  }))

  /** 列几何只决定横向位置，纵向统一贴带底。 */
  const columnStyle = (column: PaneGeometry['axisColumns'][number]) => ({
    left: `${column.left}px`,
    width: `${column.width}px`,
  })

  function onSettingsChange(settings: ChartSettings): void {
    emit('settings-change', settings)
  }
</script>

<style scoped>
  .pane-axis-shortcuts-layer,
  .pane-axis-settings-layer {
    position: absolute;
    left: 0;
    z-index: 2;
  }

  /* 设置层覆盖整列，只让入口本身接收指针，否则会吞掉快捷按钮的悬停。 */
  .pane-axis-settings-layer {
    pointer-events: none;
  }

  .price-axis-shortcuts {
    position: absolute;
    /* 让出列底部 20px 的轴设置入口。 */
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    visibility: hidden;
    pointer-events: none;
  }

  .pane-axis-shortcuts-layer:hover .price-axis-shortcuts,
  .pane-axis-shortcuts-layer:focus-within .price-axis-shortcuts {
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
