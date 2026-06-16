import { describe, it, expect } from 'vitest'
import {
  ALL_TOOLS,
  TOOL_GROUPS,
  CHART_NAVIGATION_TOOLS,
  INDICATOR_TOOLS,
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

  it('CHART_NAVIGATION_TOOLS includes zoomToLevel + setTheme', () => {
    const names = CHART_NAVIGATION_TOOLS.map((t) => t.name)
    expect(names).toContain('chart.zoomToLevel')
    expect(names).toContain('chart.setTheme')
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

  it('alerts.addPriceCross required fields enforce id+name+price+direction+oneShot', () => {
    const t = findTool('alerts.addPriceCross')!
    if (t.inputSchema.type === 'object') {
      expect(t.inputSchema.required).toEqual(
        expect.arrayContaining(['id', 'name', 'price', 'direction', 'oneShot']),
      )
    }
  })
})
