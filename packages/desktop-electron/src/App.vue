<template>
  <AgentWorkbenchShell
    :bridge="bridge"
    :panel-width-storage="panelWidthStorage"
    :panel-side-storage="panelSideStorage"
  >
    <template #chart>
      <KlineChart
        ref="chartRef"
        :market-data-context="e2eMarket?.host"
        :symbols="e2eMarket?.symbols"
        @controller-ready="(controller) => bridge.bindChartAgent(controller.agent)"
      />
    </template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import {
    AgentWorkbenchShell,
    BrowserAgentBridge,
    createAgentPanelSideStorage,
    createAgentPanelWidthStorage,
  } from '@363045841yyt/klinechart/agent'
  import { KlineChart } from '@363045841yyt/klinechart'
  import { createMarketDataHost } from '@363045841yyt/klinechart'
  import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
  import { onBeforeUnmount, ref } from 'vue'

  import { createElectronCredentialStore } from './features/agent/electron-credential-store'
  import { createE2eDataSource } from './features/agent/chart-e2e-fixture'

  /** Electron E2E 也沿注册源加载，不提供任何旁路行情入口。 */
  async function prepareE2eMarket() {
    const fixture = createE2eDataSource()
    const host = createMarketDataHost()
    host.registerDataSource(fixture.source)
    const instrument = await host.resolveInstrument(fixture.instrument.sourceId, fixture.instrument.id)
    return { host, symbols: [{ instrument, symbol: instrument.symbol, market: 'CN', source: fixture.source.id, period: 'daily' }] }
  }
  const e2eMarket = import.meta.env.MODE === 'e2e' ? await prepareE2eMarket() : undefined
  onBeforeUnmount(() => e2eMarket?.host.dispose())

  const chartRef = ref<{ getController?: () => { agent: ChartAgentController } } | null>(null)
  // preload 缺席时返回 undefined，bridge 退回默认的 localStorage 实现，应用仍可启动。
  const bridge = new BrowserAgentBridge({
    getChartAgent: () => chartRef.value?.getController?.()?.agent,
    credentials: createElectronCredentialStore(),
  })
  onBeforeUnmount(() => bridge.close())

  const panelWidthStorage = createAgentPanelWidthStorage()
  const panelSideStorage = createAgentPanelSideStorage()
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
