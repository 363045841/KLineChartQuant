<!-- 浏览器 Agent 宿主只在工作台启用 Agent 时加载，图表通过插槽保持唯一实例。 -->
<template>
  <AgentWorkbenchShell
    :bridge="bridge"
    :panel-width-storage="panelWidthStorage"
    :panel-side-storage="panelSideStorage"
    :initial-panel-open="initialPanelOpen"
    :panel-tabs="panelTabs"
    :quick-prompts="quickPrompts"
  >
    <template #chart><slot /></template>
    <template #panel="{ tab }">
      <OrderflowPanel
        v-if="tab === ORDERFLOW_TAB_NAME"
        :source="orderflowSource"
        :symbol="chartSymbol"
      />
      <OptionPanel v-else-if="tab === OPTIONS_TAB_NAME" :state="optionState" />
    </template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
  // 工具登记契约随 @Tool 注册表移到 /agent-tools 子入口，controllers 不再重导出。
  import { resolveOptionUnderlying } from '@363045841yyt/klinechart-core'
  import type { RegisteredChartTool } from '@363045841yyt/klinechart-core/agent-tools'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { computed, onBeforeUnmount, watch } from 'vue'
  import AgentWorkbenchShell from '../../features/agent/AgentWorkbenchShell.vue'
  import { BrowserAgentBridge } from '../../features/agent/browser-agent/bridge/impl/browser-agent-bridge.js'
  import { createAgentPanelSideStorage } from '../../features/agent/workspace/impl/agent-panel-side-storage.js'
  import { createAgentPanelWidthStorage } from '../../features/agent/workspace/impl/agent-panel-width-storage.js'
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
  import { useChartSymbol } from './use-chart-symbol.js'

  /** 订单流页签的名字，与 `#panel` 插槽里的判断保持一致。 */
  const ORDERFLOW_TAB_NAME = 'orderflow'

  /** 期权页签的名字。 */
  const OPTIONS_TAB_NAME = 'options'

  const props = defineProps<{
    controller: ChartController | null
    initialPanelOpen: boolean
    /** 宿主注入的凭据存储；省略时沿用浏览器默认实现。 */
    credentials?: ProviderCredentialStore
    /** 宿主追加的图表工具惰性源；省略时不追加。 */
    extraChartTools?: () => ReadonlyArray<RegisteredChartTool>
    /** 分析服务地址（订单流与期权同一个 `analytics serve`）；省略时用内置默认。 */
    orderflowBaseUrl?: string
  }>()
  const bridge = new BrowserAgentBridge({
    getChartAgent: () => props.controller?.agent,
    credentials: props.credentials,
    extraChartTools: props.extraChartTools,
  })
  const panelWidthStorage = createAgentPanelWidthStorage()
  const panelSideStorage = createAgentPanelSideStorage()

  /** 面板页签：Agent 由外壳自带，这里声明订单流与期权。 */
  const panelTabs = [
    { name: ORDERFLOW_TAB_NAME, label: '订单流' },
    { name: OPTIONS_TAB_NAME, label: '期权' },
  ]

  const orderflowSource = createOrderflowClient({
    fetch: (...args) => globalThis.fetch(...args),
    baseUrl: props.orderflowBaseUrl,
  })

  // 期权与订单流共用同一个只读服务容器，所以复用同一个地址来源。
  const optionSource = createOptionClient({
    fetch: (...args) => globalThis.fetch(...args),
    baseUrl: props.orderflowBaseUrl,
  })

  /** 图表当前品种：经 Core signal 桥接，换品种后两个面板一起切换。 */
  const chartSymbol = useChartSymbol(() => props.controller)

  /** 图品种到期权标的的映射；没有期权源的品种返回 null，面板据此显示提示。 */
  const optionUnderlying = computed<string | null>(() => resolveOptionUnderlying(chartSymbol.value))

  // 面板状态提升到这里：期权面板与 AI 面板的「快速解读」必须看同一份数据。
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
