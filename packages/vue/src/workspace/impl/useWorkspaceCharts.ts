/** 工作区内图表的恢复、订阅与清理；Web 和桌面共用相同的实例生命周期。 */

import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import type { ChartController, SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import { onBeforeUnmount, watch } from 'vue'
import type { WorkspaceTab } from '../types.js'

interface WorkspaceChartsOptions {
  readonly tabs: readonly WorkspaceTab[]
  readonly activeTabId: string
  readonly themeMode?: ChartSettings['theme']
}

interface WorkspaceChartEvents {
  spec(tabId: string, spec: SymbolSpec | null): void
  active(controller: ChartController): void
  theme(theme: 'light' | 'dark'): void
}

/** 绑定标签与图表，关闭标签时立即释放它的所有订阅。 */
export function useWorkspaceCharts(options: WorkspaceChartsOptions, events: WorkspaceChartEvents) {
  const controllers = new Map<string, ChartController>()
  const subscriptions = new Map<string, (() => void)[]>()

  /** 释放某个已关闭或重新就绪的图表订阅。 */
  function release(tabId: string): void {
    for (const stop of subscriptions.get(tabId) ?? []) stop()
    subscriptions.delete(tabId)
    controllers.delete(tabId)
  }

  /** 活动图表决定宿主主题与浏览器标题的数据来源。 */
  function publishActive(): void {
    const controller = controllers.get(options.activeTabId)
    if (!controller) return
    events.active(controller)
    events.theme(controller.theme.peek())
  }

  /** 恢复已保存品种，然后接管后续更新，避免初始品种覆盖存档。 */
  function onControllerReady(tabId: string, controller: ChartController): void {
    const tab = options.tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return
    release(tabId)
    const syncAppearance = () => {
      if (
        options.themeMode !== undefined &&
        controller.settings.peek().theme !== options.themeMode
      ) {
        controller.updateSettingsFacade({ theme: options.themeMode })
      }
    }
    syncAppearance()
    // Layout 已在控制器就绪前恢复。标签品种仅用于尚未保存布局的首次挂载，
    // 不能覆盖布局里已经恢复的品种、周期及对应工作区。
    if (tab.spec && controller.symbols.peek().length === 0) controller.setSymbols([tab.spec])
    controllers.set(tabId, controller)
    const syncSpec = () => events.spec(tabId, controller.symbols.peek()[0] ?? null)
    subscriptions.set(tabId, [
      controller.settings.subscribe(syncAppearance),
      controller.symbols.subscribe(syncSpec),
      controller.theme.subscribe(() => {
        if (tabId === options.activeTabId) events.theme(controller.theme.peek())
      }),
    ])
    syncSpec()
    if (tabId === options.activeTabId) publishActive()
  }

  watch(() => options.activeTabId, publishActive)
  watch(
    () => options.themeMode,
    (theme) => {
      if (theme === undefined) return
      for (const controller of controllers.values()) controller.updateSettingsFacade({ theme })
    },
  )
  watch(
    () => options.tabs,
    (tabs) => {
      const ids = new Set(tabs.map((tab) => tab.id))
      for (const id of controllers.keys()) if (!ids.has(id)) release(id)
    },
  )
  onBeforeUnmount(() => {
    for (const id of controllers.keys()) release(id)
  })
  return { onControllerReady }
}
