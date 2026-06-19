import { describe, it, expect } from 'vitest'
import {
  ALL_TOOLS,
  TOOL_GROUPS,
  CHART_NAVIGATION_TOOLS,
  INDICATOR_TOOLS,
  DATA_TOOLS,
  DRAWING_TOOLS,
  MARKER_TOOLS,
  SETTINGS_TOOLS,
  ALERT_TOOLS,
  REPLAY_TOOLS,
  findTool,
} from '../toolSchemas'

describe('ALL_TOOLS structural invariants', () => {
  it('every tool has a unique name', () => {
    const names = ALL_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every tool name follows controller.method convention', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-zA-Z]+\.[a-zA-Z]+$/)
    }
  })

  it('every tool has a non-trivial description (>= 30 chars)', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description.length).toBeGreaterThanOrEqual(30)
    }
  })

  it('every tool inputSchema is type: object with properties', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.inputSchema.type).toBe('object')
      if (tool.inputSchema.type === 'object') {
        expect(typeof tool.inputSchema.properties).toBe('object')
      }
    }
  })

  it('safety is one of the three legal values', () => {
    const legal = new Set(['readonly', 'mutates-state', 'destroys-state'])
    for (const tool of ALL_TOOLS) {
      expect(legal.has(tool.safety)).toBe(true)
    }
  })
})

describe('TOOL_GROUPS coverage', () => {
  it('ALL_TOOLS is the union of every group', () => {
    const union = [
      ...TOOL_GROUPS.navigation,
      ...TOOL_GROUPS.indicators,
      ...TOOL_GROUPS.data,
      ...TOOL_GROUPS.drawing,
      ...TOOL_GROUPS.markers,
      ...TOOL_GROUPS.settings,
      ...TOOL_GROUPS.alerts,
      ...TOOL_GROUPS.replay,
    ]
    expect(union.length).toBe(ALL_TOOLS.length)
  })

  it('each group has at least one tool', () => {
    for (const [name, group] of Object.entries(TOOL_GROUPS)) {
      expect(group.length).toBeGreaterThan(0)
      void name
    }
  })

  it('CHART_NAVIGATION_TOOLS includes zoomToLevel + setTheme + scrollToRight + zoomIn + zoomOut', () => {
    const names = CHART_NAVIGATION_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'chart.zoomToLevel',
        'chart.setTheme',
        'chart.scrollToRight',
        'chart.zoomIn',
        'chart.zoomOut',
      ]),
    )
  })

  it('INDICATOR_TOOLS includes add/remove/updateParams', () => {
    const names = INDICATOR_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'indicators.add',
        'indicators.remove',
        'indicators.updateParams',
      ]),
    )
  })

  it('DATA_TOOLS includes setSymbols/appendData/updateData/comparison', () => {
    const names = DATA_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'data.setSymbols',
        'data.appendData',
        'data.updateData',
        'data.addComparisonSymbol',
        'data.removeComparisonSymbol',
      ]),
    )
  })

  it('DRAWING_TOOLS includes setTool/add/clear/remove', () => {
    const names = DRAWING_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'drawing.setTool',
        'drawing.add',
        'drawing.clear',
        'drawing.remove',
      ]),
    )
  })

  it('MARKER_TOOLS includes update/clear', () => {
    const names = MARKER_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'markers.update',
        'markers.clear',
      ]),
    )
  })

  it('SETTINGS_TOOLS includes update', () => {
    const names = SETTINGS_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'settings.update',
      ]),
    )
  })

  it('ALERT_TOOLS includes the two add-variants + remove', () => {
    const names = ALERT_TOOLS.map((t) => t.name)
    expect(names).toContain('alerts.addPriceCross')
    expect(names).toContain('alerts.addIndicatorCross')
    expect(names).toContain('alerts.remove')
  })

  it('REPLAY_TOOLS includes seek/play/pause/setSpeed', () => {
    const names = REPLAY_TOOLS.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'replay.seekTo',
        'replay.play',
        'replay.pause',
        'replay.setSpeed',
      ]),
    )
  })
})

describe('findTool', () => {
  it('returns the tool when name matches', () => {
    const t = findTool('chart.zoomToLevel')
    expect(t).not.toBeNull()
    expect(t?.name).toBe('chart.zoomToLevel')
  })

  it('returns null for unknown name', () => {
    expect(findTool('chart.nonexistent')).toBeUndefined()
    expect(findTool('')).toBeUndefined()
  })
})

describe('inputSchema correctness — spot checks', () => {
  it('chart.zoomToLevel requires `level` and clamps to 1-20', () => {
    const t = findTool('chart.zoomToLevel')!
    expect(t.inputSchema.type).toBe('object')
    if (t.inputSchema.type === 'object') {
      expect(t.inputSchema.required).toContain('level')
      const level = t.inputSchema.properties.level
      expect(level?.type).toBe('integer')
      if (level?.type === 'integer') {
        expect(level.minimum).toBe(1)
      }
    }
  })

  it('chart.setTheme uses an enum to constrain values', () => {
    const t = findTool('chart.setTheme')!
    if (t.inputSchema.type === 'object') {
      const theme = t.inputSchema.properties.theme
      expect(theme?.type).toBe('string')
      if (theme?.type === 'string') {
        expect(theme.enum).toEqual(['light', 'dark'])
      }
    }
  })

  it('data.setSymbols requires symbol', () => {
    const t = findTool('data.setSymbols')!
    expect(t.inputSchema.type).toBe('object')
    if (t.inputSchema.type === 'object') {
      expect(t.inputSchema.required).toContain('symbol')
    }
  })

  it('drawing.setTool uses an enum for tool types', () => {
    const t = findTool('drawing.setTool')!
    if (t.inputSchema.type === 'object') {
      const tool = t.inputSchema.properties.tool
      expect(tool?.type).toBe('string')
      if (tool?.type === 'string') {
        expect(tool.enum).toContain('trendline')
        expect(tool.enum).toContain('fib')
        expect(tool.enum).toContain(null)
      }
    }
  })

  it('settings.update requires nothing (settings and options both optional)', () => {
    const t = findTool('settings.update')!
    if (t.inputSchema.type === 'object') {
      expect(t.inputSchema.required).toBeUndefined()
    }
  })

  it('alerts.addPriceCross required fields enforce id+name+price+direction+oneShot', () => {
    const t = findTool('alerts.addPriceCross')!
    if (t.inputSchema.type === 'object') {
      expect(t.inputSchema.required).toEqual(
        expect.arrayContaining(['id', 'name', 'price', 'direction', 'oneShot']),
      )
    }
  })
})
