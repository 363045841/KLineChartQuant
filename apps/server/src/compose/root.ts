/**
 * 组合根：把行情、定义、计算、警报与脚本装配成一个可释放的运行时。
 */
import type { EventStreamFactory, MarketDataContext, MarketRuntime } from '@363045841yyt/klinechart-core/node'
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'
import type { ServerConfig } from '../config.js'
import type { AlertComposition } from './alerts.js'
import { composeAlerts } from './alerts.js'
import { composeRuntime } from './calculation.js'
import { composeDefinitions } from './definitions.js'
import { composeMarket } from './market.js'
import { composeScripts } from './scripts.js'

/** 进程持有的全部资源；释放顺序与创建顺序相反。 */
export interface ServerRoot {
  readonly market: MarketDataContext
  readonly runtime: MarketRuntime
  readonly alerts: AlertComposition
  readonly scripts: ScriptService
  dispose(): Promise<void>
}

/**
 * 装配服务根。
 *
 * @param config - 命令行配置
 * @param fetchImpl - 宿主 fetch
 * @param openEventStream - 宿主事件流
 * @param onError - 统一错误出口
 * @returns 可启动的运行时
 */
export async function composeRoot(
  config: ServerConfig,
  fetchImpl: typeof fetch,
  openEventStream: EventStreamFactory,
  onError: (error: unknown) => void,
): Promise<ServerRoot> {
  const market = composeMarket(config, fetchImpl, openEventStream)
  const definitions = composeDefinitions()
  const runtime = composeRuntime(market, definitions)
  const alerts = await composeAlerts(runtime, config, onError)
  const scripts = await composeScripts(config, definitions, (definitionId) =>
    alerts.alerts.service.alerts.peek().some((rule) => rule.script.definitionId === definitionId),
  )
  let disposed = false
  return {
    market,
    runtime,
    alerts,
    scripts,
    async dispose() {
      if (disposed) return
      disposed = true
      scripts.dispose()
      await alerts.dispose()
      runtime.dispose()
      market.dispose()
    },
  }
}
