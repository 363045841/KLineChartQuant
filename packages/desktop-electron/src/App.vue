<!--
  桌面端宿主装配：窗口外壳、标签页、行情实例、凭据存储与数据源注册。
  每个标签页是一份独立图表；标签内容不进入主进程。
-->
<template>
  <div class="desktop-shell" :style="shellStyle">
    <template v-if="tabs.ready.value">
      <TabBar
        desktop
        title="KCQ Desktop"
        :platform="windowShell.platform"
        :workspace-id="workspaceId"
        :tabs="tabs.tabs.value"
        :active-tab-id="tabs.activeTabId.value"
        :theme-mode="appearance.mode.value"
        :accent="accent"
        :can-detach="tabs.tabs.value.length > 1"
        :maximized="maximized"
        @activate="tabs.activate"
        @create="tabs.createTab"
        @close="tabs.removeTab"
        @detach="detachTab"
        @adopt="adoptTab"
        @reorder="tabs.moveTab"
        @theme-change="appearance.setMode"
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
        <WorkspaceContent
          :tabs="tabs.tabs.value"
          :active-tab-id="tabs.activeTabId.value"
          :theme-mode="appearance.mode.value"
          :workbench="{ marketDataContext: market.context, instrument: market.instrument, period, credentials, chart: { leftAxisWidth: 60 } }"
          @spec-change="tabs.setSpec"
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
    type KlineWorkbenchProps,
    type PersistedMarketDataHost,
    WorkspaceTabBar as TabBar,
    type TabDropTarget,
    tabLabelForSpec,
    useWorkspaceAppearance,
    useWorkspaceTabs,
    WorkspaceContent,
  } from '@363045841yyt/klinechart'
  import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
  import { createE2eDataSource } from './features/agent/chart-e2e-fixture'
  import { createElectronCredentialStore } from './features/agent/electron-credential-store'
  import { readWindowShell, readWorkspaceAccent, readWorkspaceId } from './shell/window-shell'
  import { workspaceAccent } from './shell/workspace-accent'

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
  const accent = workspaceAccent(readWorkspaceAccent())
  const tabs = useWorkspaceTabs(workspaceId)
  const appearance = useWorkspaceAppearance()
  /** 最大化状态以主进程推送为准，按钮图标据此切换。 */
  const maximized = ref(false)

  // 窗口标题跟随当前标签页：任务栏、Alt+Tab 与窗口菜单显示的就是选中的图表。
  watchEffect(() => {
    const activeTab = tabs.tabs.value.find((tab) => tab.id === tabs.activeTabId.value)
    if (!activeTab) return
    document.title = tabLabelForSpec(activeTab.spec)
  })

  /** 窗口事件归宿主所有，退出时统一解绑。 */
  let unsubscribeWorkspace: (() => void) | undefined
  let unsubscribeMaximized: (() => void) | undefined

  /** 拖出标签：先开新窗口接管，成功后再从本窗口移除，失败时标签仍在。 */
  async function detachTab(tabId: string): Promise<void> {
    const tab = tabs.tabs.value.find((candidate) => candidate.id === tabId)
    if (!tab) return
    await windowShell.openWindow([tab])
    await tabs.removeTab(tabId)
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
      void tabs.reload().catch((error: unknown) => console.error('Workspace reload failed', error))
    })
  })

  // 行情实例归宿主所有，工作台卸载不销毁它。
  onBeforeUnmount(() => {
    unsubscribeWorkspace?.()
    unsubscribeMaximized?.()
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
    display: flex;
    flex-direction: column;
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
