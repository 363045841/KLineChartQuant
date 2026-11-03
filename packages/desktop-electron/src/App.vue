<!-- 桌面端只做宿主装配：行情实例、凭据存储与数据源注册，界面沿用同一套产品工作台。 -->
<template>
  <KlineWorkbench
    :market-data-context="market.context"
    :instrument="market.instrument"
    :period="period"
    :credentials="credentials"
    :left-axis-width="60"
  />
</template>

<script setup lang="ts">
  import {
    createMarketDataHost,
    createPersistedMarketDataHost,
    KLinePeriod,
    KlineWorkbench,
    type KlineWorkbenchProps,
    type PersistedMarketDataHost,
  } from '@363045841yyt/klinechart'
  import { onBeforeUnmount } from 'vue'
  import { createE2eDataSource } from './features/agent/chart-e2e-fixture'
  import { createElectronCredentialStore } from './features/agent/electron-credential-store'

  /** E2E 也走注册数据源，不提供旁路行情入口；产品模式复用的持久化宿主与 Web 完全相同。 */
  function createMarket(): PersistedMarketDataHost & {
    instrument?: KlineWorkbenchProps['instrument']
  } {
    if (import.meta.env.MODE !== 'e2e') return createPersistedMarketDataHost()
    const fixture = createE2eDataSource()
    const host = createMarketDataHost()
    host.registerDataSource(fixture.source)
    return {
      context: host,
      dispose: () => host.dispose(),
      instrument: fixture.instrument,
    }
  }

  // preload 缺席时返回 undefined，工作台退回默认的浏览器凭据实现，应用仍可启动。
  const credentials = createElectronCredentialStore()
  const market = createMarket()
  const period = KLinePeriod.Daily
  // 行情实例归宿主所有，工作台卸载不销毁它。
  onBeforeUnmount(() => market.dispose())
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
