<!-- 单条轴列底部的设置入口：目标轴由所在列决定，菜单不再列轴供选择。 -->
<template>
  <DropMenu
    class="pane-axis-settings"
    :label="MENU_LABEL"
    :groups="groups"
    placement="top"
    density="compact"
    keep-open-on-select
    fill
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
    @click.stop
    @select="select"
  >
    <template #trigger>
      <IconTablerSettings aria-hidden="true" />
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import DropMenu from '@vue-src/components/common/DropMenu.vue'
  import { usePriceAxisMenu } from '@vue-src/composables/chart/usePriceAxisMenu.js'
  import { toRef } from 'vue'
  import IconTablerSettings from '~icons/tabler/settings'

  const props = defineProps<{
    controller: ChartController | null
    axisId: string
  }>()
  const emit = defineEmits<{ 'settings-change': [settings: ChartSettings] }>()
  const MENU_LABEL = '坐标轴设置'
  const { groups, select } = usePriceAxisMenu(
    toRef(() => props.controller),
    (settings) => emit('settings-change', settings),
    props.axisId,
  )
</script>

<style scoped>
  .pane-axis-settings {
    --control-button-height: 100%;
    --control-button-inline-padding: 0;
    --control-button-radius: 0;
    --control-button-justify: center;
    --control-button-color: var(--klc-color-ui-muted);
    --control-button-active-background: var(--klc-color-ui-hover);
    --control-button-active-color: var(--klc-color-ui-text);
    --control-button-focus-outline: 2px solid var(--klc-color-ui-accent);
    --control-button-focus-outline-offset: -2px;
    --control-button-focus-shadow: none;

    /* 宿主给列左边与列宽，本组件贴在该轴带最底部。 */
    position: absolute;
    bottom: 0;
    z-index: 30;
    height: 20px;
    /* 父层整体不接收指针，入口自己恢复，避免挡住上方的悬停快捷按钮。 */
    pointer-events: auto;
  }

  .pane-axis-settings svg {
    width: 14px;
    height: 14px;
  }
</style>
