import { describe, it, expect, vi } from 'vitest'
import type { ChartController } from '@363045841yyt/klinechart-core'
import { executeTool } from '../executeTool'

function createMockChart(
  overrides?: Partial<ChartController>,
): ChartController {
  return {
    catalog: [
      { id: 'MA', label: 'MA', role: 'main' as const, params: [] },
      { id: 'RSI', label: 'RSI', role: 'sub' as const, params: [] },
    ],
    zoomToLevel: vi.fn(),
    setTheme: vi.fn(),
    scrollToRight: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    addIndicator: vi.fn(() => 'inst-1'),
    removeIndicator: vi.fn(() => true),
    updateIndicatorParams: vi.fn(() => true),
    setSymbols: vi.fn(),
    appendData: vi.fn(),
    updateData: vi.fn(),
    addComparisonSymbol: vi.fn(),
    removeComparisonSymbol: vi.fn(),
    setDrawingTool: vi.fn(),
    getFullDrawings: vi.fn(() => []),
    setDrawings: vi.fn(),
    clearDrawings: vi.fn(),
    removeDrawing: vi.fn(),
    updateCustomMarkers: vi.fn(),
    clearCustomMarkers: vi.fn(),
    updateSettingsFacade: vi.fn(),
    updateOptionsFacade: vi.fn(),
    getZoomLevelCount: vi.fn(() => 10),
    getData: vi.fn(() => []),
    ...overrides,
  } as unknown as ChartController
}

describe('executeTool', () => {
  it('returns error for unknown tool name', () => {
    const chart = createMockChart()
    const result = executeTool(chart, {
      name: 'chart.nonexistent',
      input: {},
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Unknown tool/)
  })

  describe('chart.zoomToLevel', () => {
    it('calls chart.zoomToLevel with level only', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.zoomToLevel',
        input: { level: 5 },
      })
      expect(chart.zoomToLevel).toHaveBeenCalledWith(5, undefined)
      expect(result.success).toBe(true)
    })

    it('calls chart.zoomToLevel with level and anchorX', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.zoomToLevel',
        input: { level: 3, anchorX: 200 },
      })
      expect(chart.zoomToLevel).toHaveBeenCalledWith(3, 200)
      expect(result.success).toBe(true)
    })
  })

  describe('chart.setTheme', () => {
    it('calls chart.setTheme with light', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.setTheme',
        input: { theme: 'light' },
      })
      expect(chart.setTheme).toHaveBeenCalledWith('light')
      expect(result.success).toBe(true)
    })

    it('calls chart.setTheme with dark', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.setTheme',
        input: { theme: 'dark' },
      })
      expect(chart.setTheme).toHaveBeenCalledWith('dark')
      expect(result.success).toBe(true)
    })
  })

  describe('chart.scrollToRight', () => {
    it('calls chart.scrollToRight', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.scrollToRight',
        input: {},
      })
      expect(chart.scrollToRight).toHaveBeenCalledOnce()
      expect(result.success).toBe(true)
    })
  })

  describe('chart.zoomIn', () => {
    it('calls chart.zoomIn without anchor', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.zoomIn',
        input: {},
      })
      expect(chart.zoomIn).toHaveBeenCalledWith(undefined)
      expect(result.success).toBe(true)
    })

    it('calls chart.zoomIn with anchorX', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.zoomIn',
        input: { anchorX: 300 },
      })
      expect(chart.zoomIn).toHaveBeenCalledWith(300)
      expect(result.success).toBe(true)
    })
  })

  describe('chart.zoomOut', () => {
    it('calls chart.zoomOut without anchor', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.zoomOut',
        input: {},
      })
      expect(chart.zoomOut).toHaveBeenCalledWith(undefined)
      expect(result.success).toBe(true)
    })

    it('calls chart.zoomOut with anchorX', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'chart.zoomOut',
        input: { anchorX: 150 },
      })
      expect(chart.zoomOut).toHaveBeenCalledWith(150)
      expect(result.success).toBe(true)
    })
  })

  describe('indicators.add', () => {
    it('looks up role from catalog and delegates', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'indicators.add',
        input: { definitionId: 'MA' },
      })
      expect(chart.addIndicator).toHaveBeenCalledWith('MA', 'main')
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ instanceId: 'inst-1' })
    })

    it('uses sub role when catalog says sub', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'indicators.add',
        input: { definitionId: 'RSI' },
      })
      expect(chart.addIndicator).toHaveBeenCalledWith('RSI', 'sub')
      expect(result.success).toBe(true)
    })

    it('falls back to main role for unknown definitionId', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'indicators.add',
        input: { definitionId: 'BOLL' },
      })
      expect(chart.addIndicator).toHaveBeenCalledWith('BOLL', 'main')
      expect(result.success).toBe(true)
    })
  })

  describe('indicators.remove', () => {
    it('returns success when chart.removeIndicator returns true', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'indicators.remove',
        input: { instanceId: 'inst-1' },
      })
      expect(chart.removeIndicator).toHaveBeenCalledWith('inst-1')
      expect(result.success).toBe(true)
    })

    it('returns error when chart.removeIndicator returns false', () => {
      const chart = createMockChart({ removeIndicator: vi.fn(() => false) })
      const result = executeTool(chart, {
        name: 'indicators.remove',
        input: { instanceId: 'ghost' },
      })
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/ghost/)
    })
  })

  describe('indicators.updateParams', () => {
    it('returns success when chart.updateIndicatorParams returns true', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'indicators.updateParams',
        input: { instanceId: 'inst-1', params: { period: 50 } },
      })
      expect(chart.updateIndicatorParams).toHaveBeenCalledWith('inst-1', {
        period: 50,
      })
      expect(result.success).toBe(true)
    })

    it('returns error when chart.updateIndicatorParams returns false', () => {
      const chart = createMockChart({
        updateIndicatorParams: vi.fn(() => false),
      })
      const result = executeTool(chart, {
        name: 'indicators.updateParams',
        input: { instanceId: 'ghost', params: {} },
      })
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/ghost/)
    })
  })

  describe('data.setSymbols', () => {
    it('calls chart.setSymbols with symbol and defaults', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'data.setSymbols',
        input: { symbol: 'AAPL' },
      })
      expect(chart.setSymbols).toHaveBeenCalledWith([
        { symbol: 'AAPL', exchange: undefined, period: undefined, adjust: undefined, source: undefined, startDate: undefined, endDate: undefined },
      ])
      expect(result.success).toBe(true)
    })

    it('passes optional fields when provided', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'data.setSymbols',
        input: { symbol: '600519', exchange: 'SSE', period: 'daily', adjust: 'qfq' },
      })
      expect(chart.setSymbols).toHaveBeenCalledWith([
        { symbol: '600519', exchange: 'SSE', period: 'daily', adjust: 'qfq', source: undefined, startDate: undefined, endDate: undefined },
      ])
      expect(result.success).toBe(true)
    })
  })

  describe('data.appendData', () => {
    it('calls chart.appendData with bar array', () => {
      const chart = createMockChart()
      const bars = [
        { timestamp: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 10000 },
      ]
      const result = executeTool(chart, {
        name: 'data.appendData',
        input: { bars },
      })
      expect(chart.appendData).toHaveBeenCalledWith(bars)
      expect(result.success).toBe(true)
    })
  })

  describe('data.updateData', () => {
    it('calls chart.updateData with bar array', () => {
      const chart = createMockChart()
      const bars = [
        { open: 101, high: 102, low: 100, close: 101.5, volume: 12000 },
      ]
      const result = executeTool(chart, {
        name: 'data.updateData',
        input: { bars },
      })
      expect(chart.updateData).toHaveBeenCalledWith(bars)
      expect(result.success).toBe(true)
    })
  })

  describe('data.addComparisonSymbol', () => {
    it('calls chart.addComparisonSymbol', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'data.addComparisonSymbol',
        input: { symbol: 'MSFT' },
      })
      expect(chart.addComparisonSymbol).toHaveBeenCalledWith({
        symbol: 'MSFT',
        exchange: undefined,
      })
      expect(result.success).toBe(true)
    })

    it('passes exchange and source when given', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'data.addComparisonSymbol',
        input: { symbol: 'SPY', exchange: 'NYSE', source: 'tradingview' },
      })
      expect(chart.addComparisonSymbol).toHaveBeenCalledWith({
        symbol: 'SPY',
        exchange: 'NYSE',
        source: 'tradingview',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('data.removeComparisonSymbol', () => {
    it('calls chart.removeComparisonSymbol', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'data.removeComparisonSymbol',
        input: { symbol: 'MSFT' },
      })
      expect(chart.removeComparisonSymbol).toHaveBeenCalledWith('MSFT')
      expect(result.success).toBe(true)
    })
  })

  describe('drawing.setTool', () => {
    it('calls chart.setDrawingTool with tool type', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'drawing.setTool',
        input: { tool: 'trendline' },
      })
      expect(chart.setDrawingTool).toHaveBeenCalledWith('trendline')
      expect(result.success).toBe(true)
    })

    it('passes null to deactivate tool', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'drawing.setTool',
        input: { tool: null },
      })
      expect(chart.setDrawingTool).toHaveBeenCalledWith(null)
      expect(result.success).toBe(true)
    })
  })

  describe('drawing.add', () => {
    it('calls getFullDrawings + setDrawings with a new drawing appended', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'drawing.add',
        input: { kind: 'horizontal-line', anchors: [{ barIndex: 0, price: 150 }] },
      })
      expect(chart.getFullDrawings).toHaveBeenCalledOnce()
      expect(chart.setDrawings).toHaveBeenCalledOnce()
      const passed = chart.setDrawings.mock.calls[0][0] as any[]
      expect(passed.length).toBe(1)
      expect(passed[0].kind).toBe('horizontal-line')
      expect(passed[0].anchors).toHaveLength(1)
      expect(passed[0].anchors[0].index).toBe(0)
      expect(passed[0].anchors[0].price).toBe(150)
      expect(result.success).toBe(true)
      expect(result.data?.drawingId).toBeTypeOf('string')
    })

    it('appends to existing drawings', () => {
      const existing = [{ id: 'existing-1', kind: 'trend-line' }]
      const chart = createMockChart({ getFullDrawings: vi.fn(() => existing) })
      const result = executeTool(chart, {
        name: 'drawing.add',
        input: { kind: 'vertical-line', anchors: [{ barIndex: 20, price: 100 }] },
      })
      const passed = chart.setDrawings.mock.calls[0][0] as any[]
      expect(passed.length).toBe(2)
      expect(passed[0].id).toBe('existing-1')
      expect(passed[1].kind).toBe('vertical-line')
      expect(result.success).toBe(true)
    })

    it('passes style overrides when provided', () => {
      const chart = createMockChart()
      executeTool(chart, {
        name: 'drawing.add',
        input: {
          kind: 'trend-line',
          anchors: [
            { barIndex: 0, price: 100 },
            { barIndex: 10, price: 110 },
          ],
          style: { stroke: '#FF5722', strokeWidth: 3 },
        },
      })
      const passed = chart.setDrawings.mock.calls[0][0] as any[]
      expect(passed[0].style.stroke).toBe('#FF5722')
      expect(passed[0].style.strokeWidth).toBe(3)
    })

    it('provides default style when style omitted', () => {
      const chart = createMockChart()
      executeTool(chart, {
        name: 'drawing.add',
        input: { kind: 'ray', anchors: [{ barIndex: 5, price: 200 }] },
      })
      const passed = chart.setDrawings.mock.calls[0][0] as any[]
      expect(passed[0].style.stroke).toBe('#2962ff')
      expect(passed[0].style.strokeWidth).toBe(1)
    })
  })

  describe('drawing.clear', () => {
    it('calls chart.clearDrawings', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'drawing.clear',
        input: {},
      })
      expect(chart.clearDrawings).toHaveBeenCalledOnce()
      expect(result.success).toBe(true)
    })
  })

  describe('drawing.remove', () => {
    it('calls chart.removeDrawing', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'drawing.remove',
        input: { drawingId: 'draw-1' },
      })
      expect(chart.removeDrawing).toHaveBeenCalledWith('draw-1')
      expect(result.success).toBe(true)
    })
  })

  describe('markers.update', () => {
    it('calls chart.updateCustomMarkers with markers array', () => {
      const chart = createMockChart()
      const markers = [
        { id: 'm1', date: '2024-01-15', shape: 'arrow_up', label: { text: 'High' } },
      ]
      const result = executeTool(chart, {
        name: 'markers.update',
        input: { markers },
      })
      expect(chart.updateCustomMarkers).toHaveBeenCalledWith(markers)
      expect(result.success).toBe(true)
    })
  })

  describe('markers.clear', () => {
    it('calls chart.clearCustomMarkers', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'markers.clear',
        input: {},
      })
      expect(chart.clearCustomMarkers).toHaveBeenCalledOnce()
      expect(result.success).toBe(true)
    })
  })

  describe('settings.update', () => {
    it('calls updateSettingsFacade when settings passed', () => {
      const chart = createMockChart()
      const settings = { showCrosshair: true }
      const result = executeTool(chart, {
        name: 'settings.update',
        input: { settings },
      })
      expect(chart.updateSettingsFacade).toHaveBeenCalledWith(settings)
      expect(chart.updateOptionsFacade).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('calls updateOptionsFacade when options passed', () => {
      const chart = createMockChart()
      const options = { kWidth: 8 }
      const result = executeTool(chart, {
        name: 'settings.update',
        input: { options },
      })
      expect(chart.updateOptionsFacade).toHaveBeenCalledWith(options)
      expect(chart.updateSettingsFacade).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('calls both when both passed', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'settings.update',
        input: { settings: { a: 1 }, options: { b: 2 } },
      })
      expect(chart.updateSettingsFacade).toHaveBeenCalledWith({ a: 1 })
      expect(chart.updateOptionsFacade).toHaveBeenCalledWith({ b: 2 })
      expect(result.success).toBe(true)
    })

    it('succeeds with empty input', () => {
      const chart = createMockChart()
      const result = executeTool(chart, {
        name: 'settings.update',
        input: {},
      })
      expect(chart.updateSettingsFacade).not.toHaveBeenCalled()
      expect(chart.updateOptionsFacade).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })

  describe('alerts.* — not implemented', () => {
    type Case = { name: string; input: Record<string, unknown> }
    const cases: Case[] = [
      {
        name: 'alerts.addPriceCross',
        input: { id: 'a1', name: 'test', price: 100, direction: 'up', oneShot: true },
      },
      {
        name: 'alerts.addIndicatorCross',
        input: {
          id: 'a2',
          name: 'test',
          indicatorId: 'RSI',
          threshold: 70,
          direction: 'up',
          oneShot: false,
        },
      },
      { name: 'alerts.remove', input: { id: 'a1' } },
    ]

    for (const { name, input } of cases) {
      it(`returns not-implemented for ${name}`, () => {
        const chart = createMockChart()
        const result = executeTool(chart, { name, input })
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/not implemented/)
        expect(result.error).toMatch(/alerts controller/)
      })
    }
  })

  describe('replay.* — not implemented', () => {
    type Case = { name: string; input: Record<string, unknown> }
    const cases: Case[] = [
      { name: 'replay.seekTo', input: { position: 100 } },
      { name: 'replay.play', input: {} },
      { name: 'replay.pause', input: {} },
      { name: 'replay.setSpeed', input: { speed: 2 } },
    ]

    for (const { name, input } of cases) {
      it(`returns not-implemented for ${name}`, () => {
        const chart = createMockChart()
        const result = executeTool(chart, { name, input })
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/not implemented/)
        expect(result.error).toMatch(/replay controller/)
      })
    }
  })
})
