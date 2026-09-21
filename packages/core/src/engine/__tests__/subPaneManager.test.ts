import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import type { SubPaneSpec } from '../state/indicatorState'
import { type SubPaneContext, SubPaneManager } from '../subPaneManager'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 构造副图管理器的最小运行时上下文；metadata 由静态定义注册表提供。 */
function createMockContext(): SubPaneContext & {
  renderers: Map<string, unknown>
  layers: Set<string>
} {
  const renderers = new Map<string, unknown>()
  const layers = new Set<string>()
  return {
    renderers,
    layers,
    onPaneProjectionChanged: vi.fn(),
    getRenderer: vi.fn((name) => renderers.get(name) as never),
    useRenderer: vi.fn((renderer) => renderers.set(renderer.name, renderer)),
    removeRenderer: vi.fn((name) => renderers.delete(name)),
    updateRendererConfig: vi.fn(),
    getOption: () => ({
      rightAxisWidth: 60,
      priceLabelWidth: 60,
      yPaddingPx: 4,
    }),
    getCrosshairPos: () => null,
    getCrosshairPrice: () => null,
    getActivePaneId: () => null,
    getRenderContext: () => null,
  }
}

describe('SubPaneManager runtime projection', () => {
  let manager: SubPaneManager
  let ctx: ReturnType<typeof createMockContext>
  const rsi: SubPaneSpec = {
    instanceId: 'user:rsi:0',
    paneId: 'RSI_0',
    indicatorId: 'RSI',
    ordinal: 0,
    params: { period1: 6 },
  }

  beforeEach(() => {
    manager = new SubPaneManager()
    ctx = createMockContext()
  })

  it('does not expose or own a business entries signal', () => {
    expect('entriesSignal' in manager).toBe(false)
  })

  it('mounts desired resources once across repeated reconcile calls', () => {
    manager.reconcile(ctx, [rsi])
    manager.reconcile(ctx, [rsi])

    expect(ctx.useRenderer).toHaveBeenCalledTimes(3)
    expect(manager.getMountedResources('RSI_0')?.rendererName).toBe('rsi_RSI_0')
    expect(manager.getMountedResources('RSI_0')?.scaleRendererName).toBe('rsiScale_RSI_0')
  })

  it('updates configs without recreating resources when only params change', () => {
    manager.reconcile(ctx, [rsi])
    vi.clearAllMocks()

    manager.reconcile(ctx, [{ ...rsi, params: { period1: 12 } }])

    expect(ctx.useRenderer).not.toHaveBeenCalled()
    expect(ctx.updateRendererConfig).toHaveBeenCalledWith('rsi_RSI_0', { period1: 12 })
    expect(ctx.updateRendererConfig).toHaveBeenCalledWith('paneTitle_RSI_0', {
      params: { period1: 12 },
      indicatorId: 'RSI',
    })
  })

  it('unmounts resources absent from desired state', () => {
    manager.reconcile(ctx, [rsi])
    vi.clearAllMocks()

    manager.reconcile(ctx, [])

    expect(ctx.removeRenderer).toHaveBeenCalledTimes(3)
    expect(manager.getMountedResources('RSI_0')).toBeUndefined()
  })

  it('does not record a mount when renderer registration throws', () => {
    ctx.useRenderer = vi.fn(() => {
      throw new Error('mount failed')
    })

    expect(() => manager.reconcile(ctx, [rsi])).not.toThrow()
    expect(manager.getMountedResources('RSI_0')).toBeUndefined()
  })

  it('does not record a mount when the indicator definition is unknown', () => {
    const unknown: SubPaneSpec = { ...rsi, indicatorId: 'NOT_REGISTERED' }

    expect(() => manager.reconcile(ctx, [unknown])).not.toThrow()
    expect(ctx.useRenderer).not.toHaveBeenCalled()
    expect(manager.getMountedResources('RSI_0')).toBeUndefined()
  })

  it('keeps a failed parameter projection retryable', () => {
    manager.reconcile(ctx, [rsi])
    ctx.updateRendererConfig = vi.fn().mockImplementationOnce(() => {
      throw new Error('config failed')
    })

    expect(() => manager.reconcile(ctx, [{ ...rsi, params: { period1: 12 } }])).not.toThrow()
    manager.reconcile(ctx, [{ ...rsi, params: { period1: 12 } }])

    expect(ctx.useRenderer).toHaveBeenCalledTimes(6)
    expect(manager.getMountedResources('RSI_0')).toBeDefined()
  })

  it('distinguishes non-finite and null parameter values in projection keys', () => {
    manager.reconcile(ctx, [{ ...rsi, params: { threshold: Number.NaN } }])
    vi.clearAllMocks()

    manager.reconcile(ctx, [{ ...rsi, params: { threshold: null } }])

    expect(ctx.updateRendererConfig).toHaveBeenCalledWith('rsi_RSI_0', {
      threshold: null,
    })
  })

  it('removes the old projection when the replacement factory throws', () => {
    manager.reconcile(ctx, [rsi])
    vi.spyOn(getRegisteredIndicatorDefinition('macd')!, 'rendererFactory').mockImplementation(
      () => {
        throw new Error('factory failed')
      },
    )

    manager.reconcile(ctx, [
      { instanceId: 'user:macd:0', paneId: 'RSI_0', indicatorId: 'MACD', ordinal: 0, params: {} },
    ])

    expect(manager.getMountedResources('RSI_0')).toBeUndefined()
    expect(ctx.removeRenderer).toHaveBeenCalled()
  })
})
