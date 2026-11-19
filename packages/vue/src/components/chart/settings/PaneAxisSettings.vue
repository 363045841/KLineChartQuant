<!-- 单条轴列底部的设置入口：普通按钮只提供菜单锚点，目标轴由所在列决定。 -->
<template>
  <div class="pane-axis-settings" @pointerdown.stop @pointermove.stop @pointerup.stop @click.stop>
    <BaseTooltip :content="MENU_LABEL" placement="top" trigger-display="contents">
      <button
        v-bind="menu.buttonProps.value"
        type="button"
        class="control-button pane-axis-settings__button"
        :aria-label="MENU_LABEL"
      >
        <IconTablerSettings aria-hidden="true" />
      </button>
    </BaseTooltip>
    <MenuSurface
      v-bind="menu.menuProps.value"
      :label="MENU_LABEL"
      :groups="groups"
      placement="top"
      density="compact"
      keep-open-on-select
      @select="select"
    />
  </div>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/control-button.css'

  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import MenuSurface from '@vue-src/components/common/menu/MenuSurface.vue'
  import { useMenuButton } from '@vue-src/components/common/menu/useMenuButton.js'
  import { usePriceAxisMenu } from '@vue-src/composables/chart/usePriceAxisMenu.js'
  import { toRef } from 'vue'
  import IconTablerSettings from '~icons/tabler/settings'

  const props = defineProps<{
    controller: ChartController | null
    axisId: string
  }>()
  const emit = defineEmits<{ 'settings-change': [settings: ChartSettings] }>()
  const MENU_LABEL = '坐标轴设置'
  const menu = useMenuButton()
  const { groups, select } = usePriceAxisMenu(
    toRef(() => props.controller),
    (settings) => emit('settings-change', settings),
    () => props.axisId,
  )
</script>

<style scoped>
  .pane-axis-settings {
    /* 宿主给列左边与列宽，本组件贴在该轴带最底部。 */
    position: absolute;
    bottom: 0;
    z-index: 30;
    height: 20px;
    /* 父层整体不接收指针，入口自己恢复，避免挡住上方的悬停快捷按钮。 */
    pointer-events: auto;
  }

  /* 按钮外观沿用共享 button 底色，只把几何压成轴列底部的一格。 */
  .pane-axis-settings__button {
    --control-button-height: 100%;
    --control-button-width: 100%;
    --control-button-inline-padding: 0px;
    --control-button-radius: 0;
    --control-button-color: var(--klc-color-ui-muted);
    --control-button-active-background: var(--klc-color-ui-hover);
    --control-button-active-color: var(--klc-color-ui-text);
    --control-button-focus-outline: 2px solid var(--klc-color-ui-accent);
    --control-button-focus-outline-offset: -2px;
    --control-button-focus-shadow: none;
  }

  .pane-axis-settings__button svg {
    width: 14px;
    height: 14px;
  }
</style>
