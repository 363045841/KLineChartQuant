<!-- 源码预览与 npm 消费项目共用的正式工作台，不包含演示工具。 -->
<template>
  <SidePanelShell
    class="kline-workbench__content"
    :panels="panels"
    :initial-panel="initialPanel"
    :width-storage="widthStorage"
    :side-storage="sideStorage"
  >
    <template #chart>
      <div v-if="market.error.value" class="kline-workbench__market-error" role="alert">
        {{ market.error.value.message }}
        <BaseButton @click="market.retry">重试</BaseButton>
      </div>
      <KlineChart
        v-bind="{ ...chart, ...$attrs }"
        :market-data-context="market.context"
        :restore-layout="restoreLayout"
        :layout-storage-id="layoutStorageId"
        :symbols="market.symbols.value"
        :scripts-enabled="scripts"
        @controller-ready="onControllerReady"
        @theme-change="emit('theme-change', $event)"
        @update:is-fullscreen="emit('update:is-fullscreen', $event)"
      />
    </template>

    <template v-if="agent" #panel-agent="{ side, close, toggleSide }">
      <WorkbenchAgent
        :controller="controller"
        :credentials="credentials"
        :panel-side="side"
        @close="close"
        @toggle-panel-side="toggleSide"
      />
    </template>

    <template #panel-watchlist>
      <WatchlistPanel @select="onWatchlistSelect" />
    </template>
  </SidePanelShell>
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { computed, defineAsyncComponent, shallowRef } from 'vue'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconSparkles from '~icons/tabler/sparkles'
  import KlineChart from '../../components/chart/KLineChart.vue'
  import BaseButton from '../../components/common/BaseButton.vue'
  import WatchlistPanel from '../../components/watchlist/WatchlistPanel.vue'
  import { switchChartSymbol } from '../../composables/symbol/chartSymbolSwitch.js'
  import type { SearchableSymbol } from '../../composables/symbol/useSymbolSearch.js'
  import { useToast } from '../../composables/toast/useToast.js'
  import { provideWatchlist } from '../../composables/watchlist/useWatchlist.js'
  import {
    createSidePanelSideStorage,
    createSidePanelWidthStorage,
  } from '../../features/side-panel/impl/side-panel-storage.js'
  import SidePanelShell from '../../features/side-panel/SidePanelShell.vue'
  import type { SidePanelDefinition } from '../../features/side-panel/types.js'
  import type { KlineWorkbenchProps } from '../types.js'
  import { useWorkbenchMarket } from './useWorkbenchMarket.js'
  import { useWorkbenchServices } from './useWorkbenchServices.js'

  defineOptions({ inheritAttrs: false })
  const props = withDefaults(defineProps<KlineWorkbenchProps>(), {
    agent: true,
    scripts: true,
    initialAgentPanelOpen: false,
    restoreLayout: true,
  })
  const emit = defineEmits<{
    'controller-ready': [controller: ChartController]
    'theme-change': [theme: 'light' | 'dark']
    'update:is-fullscreen': [fullscreen: boolean]
    error: [error: Error]
  }>()

  /** 侧边菜单：Agent 在前，自选股在后；关闭 Agent 时只剩自选股。 */
  const AGENT_PANEL_ID = 'agent'
  const WATCHLIST_PANEL_ID = 'watchlist'
  const panels = computed<ReadonlyArray<SidePanelDefinition>>(() => [
    ...(props.agent ? [{ id: AGENT_PANEL_ID, label: 'Agent', icon: IconSparkles }] : []),
    { id: WATCHLIST_PANEL_ID, label: '自选股', icon: IconBookmark },
  ])
  const initialPanel = props.agent && props.initialAgentPanelOpen ? AGENT_PANEL_ID : null

  const controller = shallowRef<ChartController | null>(null)
  const WorkbenchAgent = defineAsyncComponent(() => import('./WorkbenchAgent.vue'))
  // 自选股状态在工作台根部创建一次，图表与面板共享同一份，独立挂载的图表不受影响。
  provideWatchlist()
  const widthStorage = createSidePanelWidthStorage()
  const sideStorage = createSidePanelSideStorage()
  const toast = useToast()
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

  /** 自选股点行：与工具栏选品种共用同一套切换实现。 */
  function onWatchlistSelect(item: SearchableSymbol): void {
    const current = controller.value
    if (!current) return
    try {
      switchChartSymbol(current, item)
    } catch (error) {
      toast.show({
        message: error instanceof Error ? error.message : '切换品种失败',
        tone: 'danger',
      })
    }
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
