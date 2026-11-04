<!-- 桌面端只做宿主装配：窗口外壳、行情实例、凭据存储与数据源注册，界面沿用同一套产品工作台。 -->
<template>
  <div class="desktop-shell" :style="shellStyle">
    <TitleBar v-if="windowShell" :platform="windowShell.platform" />
    <div class="desktop-shell__content">
      <KlineWorkbench
        :market-data-context="market.context"
        :instrument="market.instrument"
        :period="period"
        :credentials="credentials"
        :left-axis-width="60"
        @controller-ready="onControllerReady"
        @theme-change="onThemeChange"
      />
    </div>
  </div>
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
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { onBeforeUnmount } from 'vue'
  import { createE2eDataSource } from './features/agent/chart-e2e-fixture'
  import { createElectronCredentialStore } from './features/agent/electron-credential-store'
  import TitleBar from './shell/TitleBar.vue'
  import { readWindowShell } from './shell/window-shell'

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
  const windowShell = readWindowShell()
  // 标题栏高度由主进程下发，避免 WCO 高度与页面布局各写一份。
  const shellStyle = windowShell
    ? { '--desktop-titlebar-height': `${windowShell.titleBarHeight}px` }
    : undefined
  const market = createMarket()
  const period = KLinePeriod.Daily

  /** 原生窗口按钮读不到 CSS 变量，主题变化时把有效主题回传主进程。 */
  function onThemeChange(theme: 'light' | 'dark'): void {
    if (windowShell) void windowShell.setTitleBarTheme(theme)
  }

  /** 首帧主题以图表内核为准，避免窗口按钮配色和界面不一致。 */
  function onControllerReady(controller: ChartController): void {
    onThemeChange(controller.theme.peek())
  }

  // 行情实例归宿主所有，工作台卸载不销毁它。
  onBeforeUnmount(() => market.dispose())
</script>

<style>
  :root {
    color-scheme: light dark;
  }

  .desktop-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--klc-color-background);
  }

  /* 标题栏之外的空间全部交给工作台；min-height 保证图表能正确收缩。 */
  .desktop-shell__content {
    flex: 1;
    min-height: 0;
  }
</style>
