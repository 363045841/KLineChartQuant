/** 浏览器应用组合根，页面内所有工作台消费同一份运行时。 */
import {
  createAlertRuntime, createDefinitionRegistry, createMarketRuntime, DEFAULT_ALERT_LIMITS,
  openBrowserAlertStore, systemClock, type AlertService, type MarketRuntime,
} from '@363045841yyt/klinechart-core'
import type { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import type { ChartAgentScripts } from '@363045841yyt/klinechart-core/controllers'
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'
import { inject, onScopeDispose, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'
import { SCRIPT_SOURCE_STORE_KEY } from '../chart/scriptEditor/types.js'
import { provideMarketDataContext } from '../market/useMarketDataContext.js'
import { createScriptsPort } from '../../features/agent/browser-agent/host/impl/script-port.js'

interface AppRuntime {
  readonly market: MarketRuntime
  readonly alerts: ShallowRef<AlertService | null>
  readonly scriptTools: ChartAgentScripts | undefined
}

const APP_RUNTIME_KEY: InjectionKey<AppRuntime> = Symbol('klinechart.app-runtime')

/** 应用根负责创建与释放服务，行情宿主的创建者继续拥有行情宿主。 */
export function provideBrowserAppRuntime(context: MarketDataContext, scriptsEnabled: boolean, onError: (error: unknown) => void): Readonly<ShallowRef<AlertService | null>> {
  const definitions = createDefinitionRegistry()
  const market = createMarketRuntime({ market: context, definitions, clock: systemClock })
  const alerts = shallowRef<AlertService | null>(null)
  const scripts = shallowRef<ScriptService>()
  let active = true
  const openingAlerts = openBrowserAlertStore().then(async (document) => {
    try {
      const service = await createAlertRuntime({ runtime: market, document, limits: DEFAULT_ALERT_LIMITS, onError })
      if (active) alerts.value = service
      return service
    } catch (error) {
      await document.dispose()
      throw error
    }
  })
  const openingScripts = scriptsEnabled ? openingAlerts.then(async (service) => {
    if (!active) return undefined
    const { createBrowserScriptService } = await import('../chart/scriptEditor/impl/createBrowserScriptService.js')
    return createBrowserScriptService({
      definitions,
      isDefinitionReferenced: (id) => service.alerts.peek().some((rule) => rule.script.definitionId === id),
    })
  }) : undefined
  void openingAlerts.catch(onError)
  void openingScripts?.then((service) => { if (active) scripts.value = service }, onError)

  provideMarketDataContext(context)
  provide(SCRIPT_SOURCE_STORE_KEY, scripts)
  provide(APP_RUNTIME_KEY, { market, alerts, scriptTools: openingScripts && createScriptsPort(async () => {
    const service = await openingScripts
    if (!active || !service) throw new Error('Script service is closed')
    return service
  }) })

  onScopeDispose(() => {
    active = false
    void Promise.allSettled([openingAlerts, openingScripts]).then(async ([alert, script]) => {
      try {
        if (alert.status === 'fulfilled') await alert.value.dispose()
      } finally {
        if (script.status === 'fulfilled') script.value?.dispose()
        market.dispose()
        definitions.dispose()
      }
    }).catch(onError)
  })
  return alerts
}

/** 工作台要求应用根显式提供服务。 */
export function useAppRuntime(): AppRuntime {
  const runtime = inject(APP_RUNTIME_KEY)
  if (!runtime) throw new Error('Browser application runtime is not provided')
  return runtime
}

/** 独立图表允许只挂载图表运行时。 */
export function tryUseAppRuntime(): AppRuntime | undefined {
  return inject(APP_RUNTIME_KEY, undefined)
}
