<!-- 源码预览与 npm 消费项目共用的正式工作台，不包含演示工具。 -->
<template>
  <SidePanelShell
    class="kline-workbench__content"
    :panels="panels"
    :initial-panel="initialPanel"
    :width-storage="widthStorage"
    :side-storage="sideStorage"
    :rail-footer="railFooter"
    @rail-footer="chartComponent?.openSettings()"
  >
    <template #chart>
      <div v-if="market.error.value" class="kline-workbench__market-error" role="alert">
        {{ market.error.value.message }}
        <BaseButton @click="market.retry">重试</BaseButton>
      </div>
      <KlineChart
        ref="chart"
        v-bind="{ ...chart, ...$attrs }"
        :market-data-context="market.context"
        :restore-layout="restoreLayout"
        :layout-storage-id="layoutStorageId"
        :symbols="market.symbols.value"
        :scripts-enabled="scripts"
        @controller-ready="onControllerReady"
        @theme-change="emit('theme-change', $event)"
      />
    </template>

    <template v-if="agent" #panel-agent="{ side, close }">
      <WorkbenchAgent
        :controller="controller"
        :active="agentContextActive"
        :panel-side="side"
        @close="close"
      />
    </template>

    <template #panel-alert>
      <AlertPanel
        :controller="controller"
        :search-symbols="searchSymbols"
        :aggregation-sources="aggregationSources"
        :enabled-source-names="enabledSourceNameSet"
      />
    </template>

    <template #panel-watchlist>
      <WatchlistPanel @select="onWatchlistSelect" />
    </template>

    <template #panel-object-tree>
      <ObjectTreePanel :controller="controller" />
    </template>
  </SidePanelShell>
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import AlertPanel from '@vue-src/components/alert/AlertPanel.vue'
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import { computed, defineAsyncComponent, shallowRef, useTemplateRef } from 'vue'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconTablerBell from '~icons/tabler/bell'
  import IconSettings from '~icons/tabler/settings'
  import IconSparkles from '~icons/tabler/sparkles'
  import IconStack2 from '~icons/tabler/stack-2'
  import KlineChart from '../../components/chart/KLineChart.vue'
  import WatchlistPanel from '../../components/watchlist/WatchlistPanel.vue'
  import { provideChartCommands } from '../../composables/commands/useCommands.js'
  import { useAggregationSources } from '../../composables/market/useAggregationSources.js'
  import { provideMarketDataContext } from '../../composables/market/useMarketDataContext.js'
  import { useMarketDataSourceCatalog } from '../../composables/market/useMarketDataSourceCatalog.js'
  import { createInstrumentSearch } from '../../composables/symbol/createInstrumentSearch.js'
  import { switchChartSymbol } from '../../composables/symbol/chartSymbolSwitch.js'
  import type { SearchableSymbol } from '../../composables/symbol/useSymbolSearch.js'
  import { useToast } from '../../composables/toast/useToast.js'
  import { provideWatchlist } from '../../composables/watchlist/useWatchlist.js'
  import ObjectTreePanel from '../../features/object-tree/ObjectTreePanel.vue'
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
    agentContextActive: true,
  })
  const emit = defineEmits<{
    'controller-ready': [controller: ChartController]
    'theme-change': [theme: 'light' | 'dark']
    error: [error: Error]
  }>()

  /** 侧边菜单：Agent、警报、自选股、对象树；警报和 Agent 一样按功能开关决定是否出现。 */
  const AGENT_PANEL_ID = 'agent'
  const ALERT_PANEL_ID = 'alert'
  const WATCHLIST_PANEL_ID = 'watchlist'
  const OBJECT_TREE_PANEL_ID = 'object-tree'
  const panels = computed<ReadonlyArray<SidePanelDefinition>>(() => [
    ...(props.agent ? [{ id: AGENT_PANEL_ID, label: 'Agent', icon: IconSparkles }] : []),
    ...(props.scripts ? [{ id: ALERT_PANEL_ID, label: '警报', icon: IconTablerBell }] : []),
    { id: WATCHLIST_PANEL_ID, label: '自选股', icon: IconBookmark },
    { id: OBJECT_TREE_PANEL_ID, label: '对象树', icon: IconStack2 },
  ])
  const initialPanel = props.agent && props.initialAgentPanelOpen ? AGENT_PANEL_ID : null

  const controller = shallowRef<ChartController | null>(null)
  /** 图表设置由 KLineChart 持有，侧栏底部只负责触发。 */
  const chartComponent = useTemplateRef<InstanceType<typeof KlineChart>>('chart')
  const railFooter = { label: '设置', icon: IconSettings } as const
  // 命令表由工作台创建：图表与侧栏面板共用同一份，快捷键作用域仍绑定图表根元素。
  provideChartCommands()
  const WorkbenchAgent = defineAsyncComponent(() => import('./WorkbenchAgent.vue'))
  // 自选股状态在工作台根部创建一次，图表与面板共享同一份，独立挂载的图表不受影响。
  provideWatchlist()
  const widthStorage = createSidePanelWidthStorage()
  const sideStorage = createSidePanelSideStorage()
  const toast = useToast()
  const { initialize } = useWorkbenchServices(props.scripts)
  const market = useWorkbenchMarket(props, (error) => emit('error', error))
  // 图表与侧栏面板共享同一个行情实例：面板不是图表的子节点，不能依赖图表内部注入。
  provideMarketDataContext(market.context)
  const aggregationSources = useMarketDataSourceCatalog(market.context)
  const { enabledNames: enabledSourceNames, enabledNameSet: enabledSourceNameSet } =
    useAggregationSources(aggregationSources, market.context)
  const searchSymbols = createInstrumentSearch(market.context, () => enabledSourceNames.value)
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
