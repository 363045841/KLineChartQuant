<!-- 单一价格轴的设置按钮、分组菜单和当前模式标记，与摆放位置无关。 -->
<template>
  <div class="price-axis-controls" :style="{ height: height + 'px' }">
    <div
      class="price-axis-shortcuts"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @click.stop
    >
      <button
        v-for="shortcut in shortcuts"
        :key="shortcut.id"
        type="button"
        :aria-label="shortcut.label"
        :title="shortcut.label"
        :aria-pressed="isAxisTypeSelected(shortcut.id)"
        @click="selectAxisType(shortcut.id)"
      >{{ shortcut.text }}</button>
    </div>
  <DropMenu
    class="axis-settings-menu"
    :label="MENU_LABEL"
    :groups="groups"
    trigger-class="axis-settings-button"
    placement="top"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
    @click.stop
    @select="select"
  >
    <template #trigger>
      <IconTablerSettings aria-hidden="true" />
    </template>
    <template #item-action="{ group, item }">
      <span v-if="isSelected(group.id, item.id)" class="price-axis-menu-check">
        <IconTablerCheck aria-hidden="true" />
      </span>
    </template>
  </DropMenu>
  </div>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { toRef } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerSettings from '~icons/tabler/settings'
  import { usePriceAxisMenu } from '../composables/chart/usePriceAxisMenu.js'
  import DropMenu from './DropMenu.vue'

  const props = defineProps<{
    controller: ChartController | null
    height: number
  }>()
  const emit = defineEmits<{ 'settings-change': [settings: ChartSettings] }>()
  const MENU_LABEL = '价格轴设置'
  const { groups, select, isSelected, shortcuts, selectAxisType, isAxisTypeSelected } =
    usePriceAxisMenu(
      toRef(() => props.controller),
      (settings) => emit('settings-change', settings),
    )
</script>

<style scoped>
  /* 两侧入口都铺满所在价格轴与时间轴的交叉区域。 */
  .price-axis-controls {
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 30;
    width: 100%;
  }

  .axis-settings-menu {
    height: 100%;
  }

  /* 快捷入口位于设置按钮正上方，父轴悬停时显示。 */
  .price-axis-shortcuts {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 4px;
    visibility: hidden;
    pointer-events: none;
  }

  .price-axis-shortcuts button {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    color: var(--klc-color-ui-muted);
    background: var(--klc-color-ui-background);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .price-axis-shortcuts button:hover {
    background: var(--klc-color-ui-hover);
  }

  .price-axis-shortcuts button[aria-pressed='true'] {
    background: var(--klc-color-ui-hover);
  }

  .price-axis-shortcuts button:focus-visible {
    outline: none;
    background: var(--klc-color-ui-hover);
  }

  .axis-settings-menu :deep(.axis-settings-button) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    color: var(--klc-color-ui-muted);
    background: var(--klc-color-ui-background);
    cursor: pointer;
  }

  /* Tooltip 包装层提供按钮百分比尺寸的参照盒。 */
  .axis-settings-menu :deep(.base-tooltip__trigger) {
    width: 100%;
    height: 100%;
  }

  .axis-settings-menu :deep(.axis-settings-button:hover) {
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-hover);
  }

  .axis-settings-menu :deep(.axis-settings-button:focus-visible) {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: -2px;
  }

  .axis-settings-menu :deep(.axis-settings-button svg) {
    width: 16px;
    height: 16px;
  }

  /* 当前模式的勾选标记始终可见。 */
  .price-axis-menu-check {
    display: flex;
    align-items: center;
    padding: 0 8px;
    color: var(--klc-color-ui-text);
    visibility: visible;
  }

  .price-axis-menu-check svg {
    width: 14px;
    height: 14px;
  }
</style>
