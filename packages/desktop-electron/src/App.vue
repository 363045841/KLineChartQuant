<template>
  <AgentWorkbenchShell :bridge="bridge" :panel-width-storage="panelWidthStorage">
    <template #chart>
      <KlineChart
        ref="chartRef"
        :custom-data="e2eChartData"
        @controller-ready="(controller) => bridge.bindChartAgent(controller.agent)"
      />
    </template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
  import { ref } from 'vue'
  import { BrowserAgentBridge } from '../../vue/src/features/agent/browser-agent-bridge'
  import {
    AgentWorkbenchShell,
    createAgentPanelWidthStorage,
    KlineChart,
  } from '../../vue/src/index'

  import { createE2eChartData } from './features/agent/chart-e2e-fixture'
  import { createElectronCredentialStore } from './features/agent/electron-credential-store'

  const chartRef = ref<{ getController?: () => { agent: ChartAgentController } } | null>(null)
  // preload 缺席时返回 undefined，bridge 退回默认的 localStorage 实现，应用仍可启动。
  const bridge = new BrowserAgentBridge({
    getChartAgent: () => chartRef.value?.getController?.()?.agent,
    credentials: createElectronCredentialStore(),
  })
  const e2eChartData = import.meta.env.MODE === 'e2e' ? createE2eChartData() : undefined

  const panelWidthStorage = createAgentPanelWidthStorage()
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
