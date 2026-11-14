<!-- Agent 侧边面板预设：只把图表与 Agent 工作区放进通用侧边壳，供 /agent 公共入口复用。 -->
<template>
  <SidePanelShell
    :panels="AGENT_PANELS"
    :initial-panel="initialPanelOpen ? AGENT_PANEL_ID : null"
    :width-storage="panelWidthStorage"
    :side-storage="panelSideStorage"
  >
    <template #chart><slot name="chart"></slot></template>
    <template #panel-agent="{ side, close, toggleSide }">
      <AgentWorkspace
        :bridge="bridge"
        :panel-side="side"
        @close="close"
        @toggle-panel-side="toggleSide"
      />
    </template>
  </SidePanelShell>
</template>

<script setup lang="ts">
  import IconSparkles from '~icons/tabler/sparkles'
  import SidePanelShell from '../side-panel/SidePanelShell.vue'
  import type {
    SidePanelDefinition,
    SidePanelSideStorage,
    SidePanelWidthStorage,
  } from '../side-panel/types.js'
  import type { AgentBridgeClient } from './agent-contracts.js'
  import AgentWorkspace from './components/AgentWorkspace.vue'

  /** 预设只包含 Agent 面板；工作台产品另行注册自选股等面板。 */
  const AGENT_PANEL_ID = 'agent'
  const AGENT_PANELS: ReadonlyArray<SidePanelDefinition> = [
    { id: AGENT_PANEL_ID, label: 'Agent', icon: IconSparkles },
  ]

  withDefaults(
    defineProps<{
      bridge: AgentBridgeClient
      /** 面板宽度持久化端口；由宿主决定存储介质。 */
      panelWidthStorage?: SidePanelWidthStorage
      /** 面板停靠侧持久化端口。 */
      panelSideStorage?: SidePanelSideStorage
      /** 首次挂载即展开 Agent 面板。 */
      initialPanelOpen?: boolean
    }>(),
    { initialPanelOpen: false, panelWidthStorage: undefined, panelSideStorage: undefined },
  )
</script>
