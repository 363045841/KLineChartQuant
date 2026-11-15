<!-- 价格轴与时间轴交叉处的设置入口，不承担 Pane 快捷按钮布局。 -->
<template>
  <DropMenu
    class="axis-settings-menu"
    :style="{ height: height + 'px' }"
    :label="MENU_LABEL"
    :groups="groups"
    placement="top"
    density="compact"
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
    <template #item-action="{ group, item }">
      <span v-if="isSelected(group.id, item.id)" class="drop-menu__status">
        <IconTablerCheck aria-hidden="true" />
      </span>
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import DropMenu from '@vue-src/components/common/DropMenu.vue'
  import { usePriceAxisMenu } from '@vue-src/composables/chart/usePriceAxisMenu.js'
  import { toRef } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconTablerSettings from '~icons/tabler/settings'

  const props = defineProps<{
    controller: ChartController | null
    height: number
  }>()
  const emit = defineEmits<{ 'settings-change': [settings: ChartSettings] }>()
  const MENU_LABEL = '价格轴设置'
  const { groups, select, isSelected } = usePriceAxisMenu(
    toRef(() => props.controller),
    (settings) => emit('settings-change', settings),
  )
</script>

<style scoped>
  .axis-settings-menu {
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

    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 30;
    width: 100%;
  }

  .axis-settings-menu svg {
    width: 16px;
    height: 16px;
  }
</style>
