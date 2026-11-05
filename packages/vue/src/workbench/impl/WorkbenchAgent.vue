<!-- 浏览器 Agent 宿主只在工作台启用 Agent 时加载，图表通过插槽保持唯一实例。 -->
<template>
  <AgentWorkbenchShell
    :bridge="bridge"
    :panel-width-storage="panelWidthStorage"
    :panel-side-storage="panelSideStorage"
    :initial-panel-open="initialPanelOpen"
  >
    <template #chart><slot /></template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
  import type {
    ChartController,
    RegisteredChartTool,
  } from '@363045841yyt/klinechart-core/controllers'
  import { onBeforeUnmount, watch } from 'vue'
  import AgentWorkbenchShell from '../../features/agent/AgentWorkbenchShell.vue'
  import { BrowserAgentBridge } from '../../features/agent/browser-agent/bridge/impl/browser-agent-bridge.js'
  import { createAgentPanelSideStorage } from '../../features/agent/workspace/impl/agent-panel-side-storage.js'
  import { createAgentPanelWidthStorage } from '../../features/agent/workspace/impl/agent-panel-width-storage.js'

  const props = defineProps<{
    controller: ChartController | null
    initialPanelOpen: boolean
    /** 宿主注入的凭据存储；省略时沿用浏览器默认实现。 */
    credentials?: ProviderCredentialStore
    /** 宿主追加的图表工具惰性源；省略时不追加。 */
    extraChartTools?: () => ReadonlyArray<RegisteredChartTool>
  }>()
  const bridge = new BrowserAgentBridge({
    getChartAgent: () => props.controller?.agent,
    credentials: props.credentials,
    extraChartTools: props.extraChartTools,
  })
  const panelWidthStorage = createAgentPanelWidthStorage()
  const panelSideStorage = createAgentPanelSideStorage()
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
