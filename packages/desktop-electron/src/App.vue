<template>
  <AgentWorkbenchShell :bridge="bridge" :panel-width-storage="panelWidthStorage">
    <template #chart>
      <KlineChart ref="chartRef" :custom-data="e2eChartData" />
    </template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import { ref } from 'vue'

  import { BrowserAgentBridge } from '../../vue/src/features/agent/browser-agent-bridge'
  import { AgentWorkbenchShell, KlineChart, type AgentPanelWidthStorage } from '../../vue/src/index'
  import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'

  import { createE2eChartData } from './features/agent/chart-e2e-fixture'

  const PANEL_WIDTH_KEY = 'agent.panelWidth'
  const chartRef = ref<{ getController?: () => { agent: ChartAgentController } } | null>(null)
  const bridge = new BrowserAgentBridge({
    getChartAgent: () => chartRef.value?.getController?.()?.agent,
  })
  const e2eChartData = import.meta.env.MODE === 'e2e' ? createE2eChartData() : undefined

  const panelWidthStorage: AgentPanelWidthStorage = {
    load() {
      const width = Number(window.localStorage.getItem(PANEL_WIDTH_KEY))
      return Number.isFinite(width) ? width : undefined
    },
    save(width) {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(width))
    },
  }
</script>

<style>
  :root {
    color-scheme: light dark;
  }

  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  body {
    background: #f4f6f7;
  }

  @media (prefers-color-scheme: dark) {
    body {
      background: #151a1d;
    }
  }
</style>
