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
    addIndicator: vi.fn(() => 'inst-1'),
    removeIndicator: vi.fn(() => true),
    updateIndicatorParams: vi.fn(() => true),
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
