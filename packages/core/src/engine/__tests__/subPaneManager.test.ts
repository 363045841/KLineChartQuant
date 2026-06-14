import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SubPaneManager, type SubPaneContext } from '../subPaneManager'
import type { SubIndicatorType } from '../renderers/Indicator'
import type { IndicatorScheduler } from '../indicators/scheduler'

function createMockScheduler(): Partial<IndicatorScheduler> {
  return {
    getIndicatorMetadata: vi.fn((_id: string) => ({
      rendererFactory: vi.fn(() => ({ name: 'custom_rsi_rsi_0' })),
      updateConfig: vi.fn(),
      scale: { indicatorKey: 'test', label: 'Test', decimals: 2 },
    })),
    onSubPaneChanged: vi.fn(),
  }
}

function createMockContext(): SubPaneContext {
  const scheduler = createMockScheduler()
  return {
    getIndicatorScheduler: vi.fn(() => scheduler as unknown as IndicatorScheduler),
    hasPane: vi.fn(() => false),
    upsertPane: vi.fn(),
    getRenderer: vi.fn(),
    useRenderer: vi.fn(),
    removeRenderer: vi.fn(),
    removePaneDefinition: vi.fn(),
    updateRendererConfig: vi.fn(),
    getRightAxisWidth: vi.fn(() => 60),
    getPriceLabelWidth: vi.fn(() => 60),
    getYPaddingPx: vi.fn(() => 4),
    getCrosshairPos: vi.fn(() => null),
    getCrosshairPrice: vi.fn(() => null),
    getActivePaneId: vi.fn(() => null),
  }
}

describe('SubPaneManager', () => {
  let manager: SubPaneManager
  let ctx: SubPaneContext

  beforeEach(() => {
    manager = new SubPaneManager()
    ctx = createMockContext()
    vi.clearAllMocks()
  })

  describe('updateParams', () => {
    it('should update paneTitle renderer config with new params and indicatorId', () => {
      manager.create(ctx, 'RSI_0', 'RSI' as SubIndicatorType, {
        period1: 6,
        period2: 12,
        period3: 24,
      })

      const entry = manager.getByPaneId('RSI_0')
      expect(entry).toBeDefined()
      vi.clearAllMocks()

      const newParams = { period1: 10, period2: 20, period3: 30 }
      manager.updateParams(ctx, 'RSI_0', newParams)

      expect(ctx.updateRendererConfig).toHaveBeenCalledWith(
        entry!.paneTitleRendererName,
        { params: newParams, indicatorId: 'RSI' },
      )
    })

    it('should update main indicator renderer config with new params', () => {
      manager.create(ctx, 'RSI_0', 'RSI' as SubIndicatorType, {
        period1: 6,
        period2: 12,
        period3: 24,
      })

      const entry = manager.getByPaneId('RSI_0')
      expect(entry).toBeDefined()
      vi.clearAllMocks()

      const newParams = { period1: 10, period2: 20, period3: 30 }
      manager.updateParams(ctx, 'RSI_0', newParams)

      expect(ctx.updateRendererConfig).toHaveBeenCalledWith(
        entry!.rendererName,
        newParams,
      )
    })

    it('should update scheduler config via definition.updateConfig', () => {
      const updateConfigSpy = vi.fn()
      const customScheduler: Partial<IndicatorScheduler> = {
        getIndicatorMetadata: vi.fn(() => ({
          rendererFactory: vi.fn(() => ({ name: 'custom_rsi_rsi_0' })),
          updateConfig: updateConfigSpy,
          scale: { indicatorKey: 'test', label: 'Test', decimals: 2 },
        })),
        onSubPaneChanged: vi.fn(),
      }
      const customCtx: SubPaneContext = {
        ...ctx,
        getIndicatorScheduler: vi.fn(() => customScheduler as unknown as IndicatorScheduler),
      }

      manager.create(customCtx, 'RSI_0', 'RSI' as SubIndicatorType, {
        period1: 6,
        period2: 12,
        period3: 24,
      })

      const newParams = { period1: 10, period2: 20, period3: 30 }
      manager.updateParams(customCtx, 'RSI_0', newParams)

      expect(updateConfigSpy).toHaveBeenCalled()
    })

    it('should update entry params in the manager', () => {
      manager.create(ctx, 'RSI_0', 'RSI' as SubIndicatorType, {
        period1: 6,
        period2: 12,
        period3: 24,
      })

      const newParams = { period1: 10, period2: 20, period3: 30 }
      manager.updateParams(ctx, 'RSI_0', newParams)

      const entry = manager.getByPaneId('RSI_0')
      expect(entry?.params).toEqual(newParams)
    })

    it('should fire entries signal on update', () => {
      manager.create(ctx, 'RSI_0', 'RSI' as SubIndicatorType, {
        period1: 6,
        period2: 12,
        period3: 24,
      })

      const listener = vi.fn()
      manager.entriesSignal.subscribe(listener)
      vi.clearAllMocks()

      const newParams = { period1: 10, period2: 20, period3: 30 }
      manager.updateParams(ctx, 'RSI_0', newParams)

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should silently skip when paneId does not exist', () => {
      const newParams = { period1: 10, period2: 20, period3: 30 }
      manager.updateParams(ctx, 'NONEXISTENT', newParams)

      expect(ctx.updateRendererConfig).not.toHaveBeenCalled()
      expect(ctx.getIndicatorScheduler().onSubPaneChanged).not.toHaveBeenCalled()
    })
  })
})
