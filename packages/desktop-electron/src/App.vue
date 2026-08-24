<template>
  <AgentWorkbenchShell :bridge="bridge" :panel-width-storage="panelWidthStorage">
    <template #chart>
      <KlineChart :custom-data="e2eChartData" />
    </template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import { FakeAgentBridge } from '../../vue/src/features/agent/testing/fake-agent-bridge'
  import { AgentWorkbenchShell, KlineChart, type AgentPanelWidthStorage } from '../../vue/src/index'

  import { createE2eChartData } from './features/agent/chart-e2e-fixture'
  import { NativeAgentBridgeClient } from './features/agent/native-agent-bridge'

  const PANEL_WIDTH_KEY = 'agent.panelWidth'
  const bridge = window.desktopAPI?.agent
    ? new NativeAgentBridgeClient(window.desktopAPI.agent)
    : new FakeAgentBridge()
  const e2eChartData = import.meta.env.MODE === 'e2e' ? createE2eChartData() : undefined

  const panelWidthStorage: AgentPanelWidthStorage = {
    load() {
      const width = window.desktopAPI?.store.get(PANEL_WIDTH_KEY)
      return typeof width === 'number' ? width : undefined
    },
    save(width) {
      window.desktopAPI?.store.set(PANEL_WIDTH_KEY, width)
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
