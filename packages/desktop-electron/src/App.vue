<!--
  桌面端宿主装配：窗口外壳、标签页、行情实例、凭据存储与数据源注册。
  每个标签页是一份独立图表；标签内容不进入主进程。
-->
<template>
  <div class="desktop-shell" :style="shellStyle">
    <template v-if="tabs.ready.value">
      <TabBar
        :platform="windowShell.platform"
        :workspace-id="workspaceId"
        :tabs="tabs.tabs.value"
        :active-tab-id="tabs.activeTabId.value"
        :accent="accent"
        :can-detach="tabs.tabs.value.length > 1"
        :maximized="maximized"
        @activate="tabs.activate"
        @create="tabs.createTab"
        @close="tabs.removeTab"
        @detach="detachTab"
        @adopt="adoptTab"
        @reorder="tabs.moveTab"
        @minimize="windowShell.minimize"
        @toggle-maximize="windowShell.toggleMaximize"
        @close-window="windowShell.close"
      />
      <div class="desktop-shell__content">
        <!--
          每个标签页是一份完整、自洽的工作台（含自己的 Agent 面板）。
          工作台的属性不允许依赖「谁是活动标签」：那样会换掉外层组件类型，
          让 Vue 卸载重建整棵子树，兄弟标签的图表实例会一起被销毁。
        -->
        <KlineWorkbench
          v-for="tab in tabs.tabs.value"
          v-show="tab.id === tabs.activeTabId.value"
          :key="tab.id"
          :market-data-context="market.context"
          :instrument="market.instrument"
          :restore-layout="false"
          :period="period"
          :credentials="credentials"
          :left-axis-width="60"
          @controller-ready="onControllerReady(tab.id, $event)"
        />
      </div>
    </template>
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
  import { onBeforeUnmount, onMounted, ref } from 'vue'
  import { createE2eDataSource } from './features/agent/chart-e2e-fixture'
  import { createElectronCredentialStore } from './features/agent/electron-credential-store'
  import TabBar from './shell/TabBar.vue'
  import { useWorkspaceTabs } from './shell/use-workspace-tabs'
  import { readWindowShell, readWorkspaceId } from './shell/window-shell'
  import { workspaceAccent } from './shell/workspace-accent'
  import type { TabDropTarget } from './shell/workspace-tabs'

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

  // 这个入口只由主进程加载：缺少 preload 桥或工作区身份说明装配错误，直接失败而不是猜默认值。
  const shell = readWindowShell()
  if (!shell) throw new Error('The desktop shell must run inside Electron.')
  const windowShell = shell
  const workspaceId = readWorkspaceId()
  const credentials = createElectronCredentialStore()
  // 标题栏高度由主进程下发，避免窗口布局各写一份。
  const shellStyle = { '--desktop-titlebar-height': `${windowShell.titleBarHeight}px` }
  const market = createMarket()
  const period = KLinePeriod.Daily
  const accent = workspaceAccent(workspaceId)
  const tabs = useWorkspaceTabs(workspaceId)
  /** 最大化状态以主进程推送为准，按钮图标据此切换。 */
  const maximized = ref(false)

  /** 每个图表只保留一份品种订阅，重复回报同一品种不会产生写入。 */
  const symbolSubscriptions = new Map<string, () => void>()
  let unsubscribeWorkspace: (() => void) | undefined
  let unsubscribeMaximized: (() => void) | undefined

  /** 图表当前品种回写到标签，标签标题始终跟随图表而不是另存一份。 */
  function syncSpec(tabId: string, controller: ChartController): void {
    tabs.setSpec(tabId, controller.symbols.peek()[0] ?? null)
  }

  /** 图表就绪：恢复标签保存的品种，再接管后续品种回报。 */
  function onControllerReady(tabId: string, controller: ChartController): void {
    // 标签页各自持有图表状态；多个标签同时向同一份布局归档自动保存会互相覆盖，
    // 因此桌面端关闭归档自动保存，布局菜单仍是手动保存/切换的入口。
    if (controller.layoutAutoSave.peek()) void controller.setLayoutAutoSave({ enabled: false })
    symbolSubscriptions.get(tabId)?.()
    symbolSubscriptions.set(
      tabId,
      controller.symbols.subscribe(() => syncSpec(tabId, controller)),
    )
    // 直接把标签保存的品种写回图表：不走数据源解析，因此不依赖 catalog.resolve。
    const spec = tabs.tabs.value.find((tab) => tab.id === tabId)?.spec
    if (spec) controller.setSymbols([spec])
    syncSpec(tabId, controller)
  }

  /** 拖出标签：先开新窗口接管，成功后再从本窗口移除，失败时标签仍在。 */
  async function detachTab(tabId: string): Promise<void> {
    const tab = tabs.tabs.value.find((candidate) => candidate.id === tabId)
    if (!tab) return
    await windowShell.openWindow([tab])
    tabs.removeTab(tabId)
  }

  /** 拖入标签：本地完成两边写入；源工作区被搬空时直接关掉那扇窗口。 */
  async function adoptTab(request: {
    fromWorkspaceId: string
    tabId: string
    target: TabDropTarget | null
  }): Promise<void> {
    const { adopted, sourceEmptied } = await tabs.adopt(
      request.fromWorkspaceId,
      request.tabId,
      request.target,
    )
    if (!adopted) return
    if (sourceEmptied) {
      await windowShell.closeWorkspace(request.fromWorkspaceId)
      return
    }
    await windowShell.adoptTab({ fromWorkspaceId: request.fromWorkspaceId, tabId: request.tabId })
  }

  onMounted(async () => {
    maximized.value = (await windowShell.getWindowState()).maximized
    unsubscribeMaximized = windowShell.onMaximizedChanged((value) => {
      maximized.value = value
    })
    await tabs.restore(await windowShell.consumeInitialTabs())
    unsubscribeWorkspace = windowShell.onWorkspaceChanged(() => {
      void tabs.reload()
    })
  })

  // 行情实例归宿主所有，工作台卸载不销毁它。
  onBeforeUnmount(() => {
    unsubscribeWorkspace?.()
    unsubscribeMaximized?.()
    for (const unsubscribe of symbolSubscriptions.values()) unsubscribe()
    symbolSubscriptions.clear()
    void tabs.dispose()
    market.dispose()
  })
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
    position: relative;
    flex: 1;
    min-height: 0;
    /* 分隔线在这里而不是标题栏底部：标题栏高度内会被系统窗口按钮覆盖层挡住右半段。 */
    border-top: 1px solid var(--klc-color-ui-border);
  }
</style>
