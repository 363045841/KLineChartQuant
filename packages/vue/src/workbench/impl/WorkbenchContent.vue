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
        ref="agentView"
        :controller="controller"
        :credentials="credentials"
        :extra-chart-tools="extraChartTools"
        :panel-side="side"
        :quick-prompts="quickPrompts"
        @close="close"
      />
    </template>

    <template #panel-orderflow>
      <OrderflowPanel :source="orderflowSource" :symbol="chartSymbol" />
    </template>

    <template #panel-options>
      <OptionPanel :state="optionState" />
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
  import { resolveOptionUnderlying } from '@363045841yyt/klinechart-core'
  // 工具登记契约随 @Tool 注册表移到 /agent-tools 子入口，controllers 不再重导出。
  import type { RegisteredChartTool } from '@363045841yyt/klinechart-core/agent-tools'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { computed, defineAsyncComponent, shallowRef, useTemplateRef } from 'vue'
  import IconActivity from '~icons/tabler/activity'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconChartPie from '~icons/tabler/chart-pie'
  import IconSettings from '~icons/tabler/settings'
  import IconSparkles from '~icons/tabler/sparkles'
  import IconStack2 from '~icons/tabler/stack-2'
  import KlineChart from '../../components/chart/KLineChart.vue'
  import BaseButton from '../../components/common/BaseButton.vue'
  import WatchlistPanel from '../../components/watchlist/WatchlistPanel.vue'
  import { provideChartCommands } from '../../composables/commands/useCommands.js'
  import { switchChartSymbol } from '../../composables/symbol/chartSymbolSwitch.js'
  import type { SearchableSymbol } from '../../composables/symbol/useSymbolSearch.js'
  import { useToast } from '../../composables/toast/useToast.js'
  import { provideWatchlist } from '../../composables/watchlist/useWatchlist.js'
  import ObjectTreePanel from '../../features/object-tree/ObjectTreePanel.vue'
  import OptionPanel from '../../features/options/components/OptionPanel.vue'
  import { createOptionClient } from '../../features/options/impl/option-client.js'
  import { describeOptionStructure } from '../../features/options/impl/option-structure.js'
  import {
    describeVolatility,
    describeVolatilityStats,
  } from '../../features/options/impl/option-summary.js'
  import { useOptionPanel } from '../../features/options/impl/use-option-panel.js'
  import OrderflowPanel from '../../features/orderflow/components/OrderflowPanel.vue'
  import { createOrderflowClient } from '../../features/orderflow/impl/orderflow-client.js'
  import {
    createSidePanelSideStorage,
    createSidePanelWidthStorage,
  } from '../../features/side-panel/impl/side-panel-storage.js'
  import SidePanelShell from '../../features/side-panel/SidePanelShell.vue'
  import type { SidePanelDefinition } from '../../features/side-panel/types.js'
  import type { KlineWorkbenchProps } from '../types.js'
  import { resolveInitialPanel } from './resolveInitialPanel.js'
  import { useChartSymbol } from './use-chart-symbol.js'
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
    error: [error: Error]
  }>()

  /** 侧边菜单：Agent 在前，订单流、期权、自选股、对象树依次在后；关闭 Agent 时只保留后四项。 */
  const AGENT_PANEL_ID = 'agent'
  const ORDERFLOW_PANEL_ID = 'orderflow'
  const OPTIONS_PANEL_ID = 'options'
  const WATCHLIST_PANEL_ID = 'watchlist'
  const OBJECT_TREE_PANEL_ID = 'object-tree'
  const panels = computed<ReadonlyArray<SidePanelDefinition>>(() => [
    ...(props.agent ? [{ id: AGENT_PANEL_ID, label: 'Agent', icon: IconSparkles }] : []),
    { id: ORDERFLOW_PANEL_ID, label: '订单流', icon: IconActivity },
    { id: OPTIONS_PANEL_ID, label: '期权', icon: IconChartPie },
    { id: WATCHLIST_PANEL_ID, label: '自选股', icon: IconBookmark },
    { id: OBJECT_TREE_PANEL_ID, label: '对象树', icon: IconStack2 },
  ])
  /** 首次展开的面板：显式 initialPanel 优先，无效 id 由 SidePanelShell 过滤。 */
  const initialPanel = resolveInitialPanel({
    initialPanel: props.initialPanel,
    initialAgentPanelOpen: props.initialAgentPanelOpen,
  })

  const controller = shallowRef<ChartController | null>(null)
  // 订单流与期权共用同一个只读分析服务；地址省略时用客户端内置默认。
  const orderflowSource = createOrderflowClient({ fetch: (...args) => globalThis.fetch(...args) })
  const optionSource = createOptionClient({ fetch: (...args) => globalThis.fetch(...args) })
  /** 图表当前品种：经 Core signal 桥接，换品种后两个面板一起切换。 */
  const chartSymbol = useChartSymbol(() => controller.value)
  /** 图品种到期权标的的映射；没有期权源的品种返回 null，面板据此显示提示。 */
  const optionUnderlying = computed<string | null>(() => resolveOptionUnderlying(chartSymbol.value))
  // 期权视图提升到工作台根部：期权面板与 Agent 的「快速解读」必须看同一份数据。
  const optionState = useOptionPanel({
    source: optionSource,
    underlying: () => optionUnderlying.value,
  })

  /**
   * 输入框上方的快捷提示：结构三行 + 解读约束。
   *
   * 约束写进草稿本身，因为快捷提示只是把文字填进输入框，模型看不到系统提示；
   * 让它引用已有数字、只用条件句、不给点位建议，才能与面板口径保持一致。
   */
  const quickPrompts = computed<readonly string[]>(() => {
    const view = optionState.view.value
    if (view === null) return []
    const reading = describeOptionStructure(view)
    const lines = ['期权结构（实采数据）：', `基调：${reading.bias}`]
    if (reading.zones !== '') lines.push(`走廊：${reading.zones}`)
    const volatility = describeVolatility(view)
    if (volatility !== '') lines.push(volatility)
    lines.push(describeVolatilityStats(view.volatility))
    for (const item of reading.watch) lines.push(`注意：${item}`)
    lines.push(
      '请只解读结构：①指出最突出的跨指标矛盾；②说明改变结构的具体价位与条件；' +
        '③只用上面出现的数字，不要自己算；④不给入场、止损、目标价，用「更容易」「倾向于」这类条件句；' +
        '⑤各项同向时直接说没有背离；' +
        '⑥引用分位必须带窗口与样本天数，样本不足就说「仅 N 天」；分位是当前 IV 在窗口内的位置，' +
        '不是风险大小；近月到期或换月后历史分位的样本口径已变，要在结论里说明。',
    )
    return [lines.join('\n')]
  })

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

  /** Agent 宿主的工具补录入口；Agent 关闭或尚未加载时静默忽略。 */
  const agentView = shallowRef<{
    registerChartTools?: (tools: ReadonlyArray<RegisteredChartTool>) => void
  } | null>(null)
  function registerChartTools(tools: ReadonlyArray<RegisteredChartTool>): void {
    agentView.value?.registerChartTools?.(tools)
  }
  defineExpose({ getController: () => controller.value, registerChartTools })
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
