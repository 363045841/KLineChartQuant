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
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { onBeforeUnmount, watch } from 'vue'
  import AgentWorkbenchShell from '../../features/agent/AgentWorkbenchShell.vue'
  import { BrowserAgentBridge } from '../../features/agent/browser-agent/bridge/impl/browser-agent-bridge.js'
  import { createAgentPanelSideStorage } from '../../features/agent/workspace/impl/agent-panel-side-storage.js'
  import { createAgentPanelWidthStorage } from '../../features/agent/workspace/impl/agent-panel-width-storage.js'

  const props = defineProps<{ controller: ChartController | null; initialPanelOpen: boolean }>()
  const bridge = new BrowserAgentBridge({ getChartAgent: () => props.controller?.agent })
  const panelWidthStorage = createAgentPanelWidthStorage()
  const panelSideStorage = createAgentPanelSideStorage()
  watch(() => props.controller, (controller) => bridge.bindChartAgent(controller?.agent), { immediate: true })
  onBeforeUnmount(() => { void bridge.close() })
</script>
