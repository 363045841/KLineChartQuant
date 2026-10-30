<!-- 源码预览与 npm 消费项目共用的正式工作台，不包含演示工具。 -->
<template>
  <component
    :is="agent ? WorkbenchAgent : 'div'"
    class="kline-workbench__content"
    :controller="agent ? controller : undefined"
    :initial-panel-open="agent ? initialAgentPanelOpen : undefined"
  >
    <div v-if="market.error.value" class="kline-workbench__market-error" role="alert">
      {{ market.error.value.message }}
      <BaseButton @click="market.retry">重试</BaseButton>
    </div>
    <KlineChart
      v-bind="{ ...chart, ...$attrs }"
      :market-data-context="market.context"
      :symbols="market.symbols.value"
      :scripts-enabled="scripts"
      @controller-ready="onControllerReady"
      @theme-change="emit('theme-change', $event)"
      @update:is-fullscreen="emit('update:is-fullscreen', $event)"
    />
  </component>
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { defineAsyncComponent, shallowRef } from 'vue'
  import KlineChart from '../../components/chart/KLineChart.vue'
  import BaseButton from '../../components/common/BaseButton.vue'
  import type { KlineWorkbenchProps } from '../types.js'
  import { useWorkbenchServices } from './useWorkbenchServices.js'
  import { useWorkbenchMarket } from './useWorkbenchMarket.js'

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
    error: [error: Error]
  }>()
  const controller = shallowRef<ChartController | null>(null)
  const WorkbenchAgent = defineAsyncComponent(() => import('./WorkbenchAgent.vue'))
  const { initialize } = useWorkbenchServices(props.scripts)
  const market = useWorkbenchMarket(props, (error) => emit('error', error))
  void market.initialize()
  void initialize().catch((cause: unknown) => {
    emit('error', cause instanceof Error ? cause : new Error(String(cause)))
  })

  /** 对外转发同一个图表控制器，Agent 和宿主不再各自组装图表。 */
  function onControllerReady(value: ChartController): void {
    controller.value = value
    emit('controller-ready', value)
  }
  defineExpose({ getController: () => controller.value })
</script>

<style>
  .kline-workbench__content {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    --kmap-chart-width: 100%;
    --kmap-chart-height: 100%;
  }
  .kline-workbench__market-error {
    position: absolute;
    inset: 0 0 auto;
    z-index: 1;
  }
</style>
