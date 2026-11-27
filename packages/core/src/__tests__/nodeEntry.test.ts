/**
 * Node 入口守门：在没有 DOM 类型的环境里装配运行时与警报。
 *
 * 本文件的 import 图由 `tsconfig.node.json` 以 `lib: ["ESNext"]` 校验；
 * 用例再确认运行期同样不依赖浏览器全局。
 */
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  createAlertRuntime,
  createDefinitionRegistry,
  createMarketDataHost,
  createMarketRuntime,
  createMemoryDocumentStore,
  DEFAULT_ALERT_LIMITS,
  systemClock,
  type AlertFiresDocument,
  type AlertRulesDocument,
} from '../node.js'

describe('core/node entry', () => {
  it('assembles the runtime and alert service without browser globals', async () => {
    expect(typeof document).toBe('undefined')
    const market = createMarketDataHost()
    const definitions = createDefinitionRegistry()
    const runtime = createMarketRuntime({ market, definitions, clock: systemClock })
    const onError = vi.fn()
    const alerts = await createAlertRuntime({
      runtime,
      rules: createMemoryDocumentStore<AlertRulesDocument>(null),
      fires: createMemoryDocumentStore<AlertFiresDocument>(null),
      limits: DEFAULT_ALERT_LIMITS,
      onError,
    })
    try {
      expect(alerts.service.alerts.peek()).toEqual([])
      expect(runtime.data).toBeDefined()
      expect(typeof document).toBe('undefined')
    } finally {
      await alerts.dispose()
      runtime.dispose()
      market.dispose()
    }
  })
})
