<!-- 源码预览与 npm 消费项目共用的正式工作台，不包含演示工具。 -->
<template>
  <component
    :is="agent ? WorkbenchAgent : 'div'"
    class="kline-workbench__content"
    :controller="agent ? controller : undefined"
    :initial-panel-open="agent ? initialAgentPanelOpen : undefined"
  >
    <KlineChart
      v-bind="{ ...chart, ...$attrs }"
      :market-data-context="marketDataContext"
      :scripts-enabled="scripts"
      @controller-ready="onControllerReady"
      @theme-change="emit('theme-change', $event)"
      @update:is-fullscreen="emit('update:is-fullscreen', $event)"
    />
  </component>
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { defineAsyncComponent, provide, shallowRef } from 'vue'
  import KlineChart from '../../components/chart/KLineChart.vue'
  import { SCRIPT_SOURCE_STORE_KEY } from '../../composables/chart/scriptEditor/types.js'
  import type { KlineWorkbenchProps } from '../types.js'
  import { useWorkbenchServices } from './useWorkbenchServices.js'

  defineOptions({ inheritAttrs: false })
  const props = withDefaults(defineProps<KlineWorkbenchProps>(), {
    agent: true,
    scripts: true,
    initialAgentPanelOpen: true,
  })
  const emit = defineEmits<{
    'controller-ready': [controller: ChartController]
    'theme-change': [theme: 'light' | 'dark']
    'update:is-fullscreen': [fullscreen: boolean]
  }>()
  const controller = shallowRef<ChartController | null>(null)
  const WorkbenchAgent = defineAsyncComponent(() => import('./WorkbenchAgent.vue'))
  const { initialize } = useWorkbenchServices(props.scripts)
  const scriptService = await initialize()
  if (scriptService) provide(SCRIPT_SOURCE_STORE_KEY, scriptService)

  /** 对外转发同一个图表控制器，Agent 和宿主不再各自组装图表。 */
  function onControllerReady(value: ChartController): void {
    controller.value = value
    emit('controller-ready', value)
  }
  defineExpose({ getController: () => controller.value })
</script>

<style>
  .kline-workbench__content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    --kmap-chart-width: 100%;
    --kmap-chart-height: 100%;
  }
</style>
