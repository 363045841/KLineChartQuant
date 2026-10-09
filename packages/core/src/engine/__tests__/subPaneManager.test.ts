import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderContext } from '../../foundation/plugin/index'
import type { Layer } from '../../rendering/scene/types'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import { type SubPaneContext, SubPaneManager } from '../pane/index'
import type { SubPaneSpec } from '../state/indicatorState'
import { createRendererLayerStore } from './helpers/rendererLayerStoreTestKit'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 构造副图管理器的最小运行时上下文；metadata 由静态定义注册表提供。 */
function createMockContext() {
  const rendererLayers = createRendererLayerStore()
  return {
    layers: rendererLayers.layers,
    onPaneProjectionChanged: vi.fn(),
    getRenderer: rendererLayers.getRenderer,
    useRenderer: rendererLayers.useRenderer,
    removeRenderer: rendererLayers.removeRenderer,
    getOption: () => ({
      rightAxisWidth: 60,
      priceLabelWidth: 60,
      yPaddingPx: 4,
    }),
    getCrosshairPos: () => null,
    getCrosshairPrice: () => null,
    getActivePaneId: () => null,
  } satisfies SubPaneContext & { layers: Map<string, Layer<RenderContext>> }
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

  it('mounts desired resources once across repeated reconcile calls', () => {
    manager.reconcile(ctx, [rsi])
    manager.reconcile(ctx, [rsi])

    expect(ctx.useRenderer).toHaveBeenCalledTimes(2)
    expect(manager.getMountedResources('RSI_0')?.rendererName).toBe('rsi_RSI_0')
    expect(manager.getMountedResources('RSI_0')?.scaleRendererName).toBe('rsiScale_RSI_0')
  })

  it('rebuilds layers when only params change', () => {
    manager.reconcile(ctx, [rsi])
    vi.clearAllMocks()

    manager.reconcile(ctx, [{ ...rsi, params: { period1: 12 } }])

    // 参数变化：原子重建数据与坐标轴。
    expect(ctx.removeRenderer).toHaveBeenCalled()
    expect(ctx.useRenderer).toHaveBeenCalled()
    expect(manager.getMountedResources('RSI_0')).toBeDefined()
  })

  it('mounts no drawing layers while hidden and restores drawing when shown', () => {
    manager.reconcile(ctx, [{ ...rsi, hidden: true }])
    expect(ctx.useRenderer).not.toHaveBeenCalled()
    expect(ctx.layers.size).toBe(0)

    vi.clearAllMocks()
    manager.reconcile(ctx, [rsi])
    expect(ctx.layers.size).toBe(2)
    expect(manager.getMountedResources('RSI_0')?.rendererName).toBe('rsi_RSI_0')
  })

  it('unmounts drawing layers when a mounted indicator becomes hidden', () => {
    manager.reconcile(ctx, [rsi])
    vi.clearAllMocks()

    manager.reconcile(ctx, [{ ...rsi, hidden: true }])

    expect(ctx.removeRenderer).toHaveBeenCalledTimes(2)
    expect(ctx.layers.size).toBe(0)
  })

  it('unmounts resources absent from desired state', () => {
    manager.reconcile(ctx, [rsi])
    vi.clearAllMocks()

    manager.reconcile(ctx, [])

    expect(ctx.removeRenderer).toHaveBeenCalledTimes(2)
    expect(manager.getMountedResources('RSI_0')).toBeUndefined()
    expect(ctx.layers.size).toBe(0)
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

  it('distinguishes non-finite and null parameter values in projection keys', () => {
    manager.reconcile(ctx, [{ ...rsi, params: { threshold: Number.NaN } }])
    vi.clearAllMocks()

    // NaN → null 视为参数变化，触发重建
    manager.reconcile(ctx, [{ ...rsi, params: { threshold: null } }])

    expect(ctx.useRenderer).toHaveBeenCalled()
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
