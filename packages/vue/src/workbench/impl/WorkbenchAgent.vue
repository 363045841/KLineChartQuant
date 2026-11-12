<!-- 浏览器 Agent 宿主只在工作台启用 Agent 时加载，图表通过插槽保持唯一实例。 -->
<template>
  <AgentWorkbenchShell
    :bridge="bridge"
    :panel-width-storage="panelWidthStorage"
    :panel-side-storage="panelSideStorage"
    :initial-panel-open="initialPanelOpen"
    :panel-tabs="panelTabs"
  >
    <template #chart><slot /></template>
    <template #panel="{ tab }">
      <OrderflowPanel
        v-if="tab === ORDERFLOW_TAB_NAME"
        :source="orderflowSource"
        :symbol="chartSymbol"
      />
    </template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
  // 工具登记契约随 @Tool 注册表移到 /agent-tools 子入口，controllers 不再重导出。
  import type { RegisteredChartTool } from '@363045841yyt/klinechart-core/agent-tools'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { computed, onBeforeUnmount, watch } from 'vue'
  import AgentWorkbenchShell from '../../features/agent/AgentWorkbenchShell.vue'
  import { BrowserAgentBridge } from '../../features/agent/browser-agent/bridge/impl/browser-agent-bridge.js'
  import { createAgentPanelSideStorage } from '../../features/agent/workspace/impl/agent-panel-side-storage.js'
  import { createAgentPanelWidthStorage } from '../../features/agent/workspace/impl/agent-panel-width-storage.js'
  import OrderflowPanel from '../../features/orderflow/components/OrderflowPanel.vue'
  import { createOrderflowClient } from '../../features/orderflow/impl/orderflow-client.js'
  import { normalizeOrderflowSymbol } from '../../features/orderflow/impl/orderflow-snapshot-tool.js'

  /** 订单流页签的名字，与 `#panel` 插槽里的判断保持一致。 */
  const ORDERFLOW_TAB_NAME = 'orderflow'

  /**
   * 图表没有品种时的回落品种。
   *
   * 订单流的数据源与图表行情是两条独立链路：行情后端没起、或图表还在加载时，
   * 面板本身仍然可用。没有回落的话，用户会看到一块空白，误以为功能坏了。
   * 面板顶部始终显示当前品种，所以回落到 BTCUSDT 不会造成「以为在看别的币」。
   */
  const DEFAULT_ORDERFLOW_SYMBOL = 'BTCUSDT'

  const props = defineProps<{
    controller: ChartController | null
    initialPanelOpen: boolean
    /** 宿主注入的凭据存储；省略时沿用浏览器默认实现。 */
    credentials?: ProviderCredentialStore
    /** 宿主追加的图表工具惰性源；省略时不追加。 */
    extraChartTools?: () => ReadonlyArray<RegisteredChartTool>
    /** 订单流只读服务地址；省略时用内置默认。 */
    orderflowBaseUrl?: string
  }>()
  const bridge = new BrowserAgentBridge({
    getChartAgent: () => props.controller?.agent,
    credentials: props.credentials,
    extraChartTools: props.extraChartTools,
  })
  const panelWidthStorage = createAgentPanelWidthStorage()
  const panelSideStorage = createAgentPanelSideStorage()

  /** 面板页签：Agent 由外壳自带，这里只声明订单流。 */
  const panelTabs = [{ name: ORDERFLOW_TAB_NAME, label: '订单流' }]

  const orderflowSource = createOrderflowClient({
    fetch: (...args) => globalThis.fetch(...args),
    baseUrl: props.orderflowBaseUrl,
  })

  /** 图表当前品种归一化成订单流用的交易对；图表没有品种时回落到默认品种。 */
  const chartSymbol = computed<string>(() => {
    const agent = props.controller?.agent
    if (agent === undefined) return DEFAULT_ORDERFLOW_SYMBOL
    const context = agent.context()
    return normalizeOrderflowSymbol(context?.symbol ?? null) ?? DEFAULT_ORDERFLOW_SYMBOL
  })

  watch(
    () => props.controller,
    (controller) => bridge.bindChartAgent(controller?.agent),
    { immediate: true },
  )
  onBeforeUnmount(() => {
    void bridge.close()
  })
  /** 宿主的工具晚于挂载就绪时补入 Agent 目录。 */
  defineExpose({
    registerChartTools: (tools: ReadonlyArray<RegisteredChartTool>) =>
      bridge.registerExternalChartTools(tools),
  })
</script>
