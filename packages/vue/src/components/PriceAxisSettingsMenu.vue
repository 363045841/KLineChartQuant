<!-- 单一价格轴的设置按钮、分组菜单和当前模式标记，与摆放位置无关。 -->
<template>
  <div class="price-axis-controls" :data-pane-id="paneId" :style="{ height: height + 'px' }">
    <div
      v-if="showShortcuts"
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
      >
        <button
          type="button"
          :aria-label="shortcut.label"
          :aria-pressed="isShortcutSelected(shortcut)"
          @click="selectShortcut(shortcut)"
        >{{ shortcut.text }}</button>
      </BaseTooltip>
    </div>
  <DropMenu
      v-if="showSettings"
      class="axis-settings-menu"
      :label="MENU_LABEL"
      :groups="groups"
      trigger-class="axis-settings-button"
      placement="top"
      density="compact"
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
        <span v-if="isSelected(group.id, item.id)" class="drop-menu__status">
          <IconTablerCheck aria-hidden="true" />
        </span>
      </template>
    </DropMenu>
  </div>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import { type ChartController, MAIN_PANE_ID } from '@363045841yyt/klinechart-core/controllers'
  import { toRef } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerSettings from '~icons/tabler/settings'
  import { usePriceAxisMenu } from '../composables/chart/usePriceAxisMenu.js'
  import BaseTooltip from './common/BaseTooltip.vue'
  import DropMenu from './DropMenu.vue'

  const props = withDefaults(
    defineProps<{
      controller: ChartController | null
      height: number
      paneId?: string
      showSettings?: boolean
      showShortcuts?: boolean
    }>(),
    { paneId: MAIN_PANE_ID, showSettings: true, showShortcuts: true },
  )
  const emit = defineEmits<{ 'settings-change': [settings: ChartSettings] }>()
  const MENU_LABEL = '价格轴设置'
  const { groups, select, isSelected, shortcuts, selectShortcut, isShortcutSelected } =
    usePriceAxisMenu(
      toRef(() => props.controller),
      (settings) => emit('settings-change', settings),
      props.paneId,
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

  /* 快捷入口位于各 Pane 轴底部，父轴悬停时显示。 */
  .price-axis-shortcuts {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: row;
    gap: 2px;
    padding-bottom: 8px;
    visibility: hidden;
    pointer-events: none;
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

  .price-axis-shortcuts button:hover {
    background: var(--klc-color-ui-hover);
  }

  .price-axis-shortcuts button:focus-visible {
    outline: none;
    background: var(--klc-color-ui-hover);
  }

  /* 开启状态只靠底色区分，边框和文字颜色与未开启时一致。 */
  .price-axis-shortcuts button[aria-pressed='true'] {
    background: var(--klc-color-ui-border);
  }

  .price-axis-shortcuts button[aria-pressed='true']:hover {
    background: var(--klc-color-ui-border-strong);
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

</style>
