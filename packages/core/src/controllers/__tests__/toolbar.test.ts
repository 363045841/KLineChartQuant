import { describe, it, expect, vi } from 'vitest'

import { createToolbarController } from '../createToolbarController'
import type { ToolDefinition } from '../types'

// ---------------------------------------------------------------------------
// Fixture — three tools, two in the same group ('lines') and one ungrouped
// ('cursor'). Mirrors the structure in src/components/LeftToolbar.vue where
// the parent "lines" item collapses to a set of children that should behave
// as a radio group.
// ---------------------------------------------------------------------------

const fixtureTools: ReadonlyArray<ToolDefinition> = [
  { id: 'cursor', label: 'Cursor' },
  { id: 'trend-line', label: 'Trend Line', group: 'lines' },
  { id: 'ray', label: 'Ray', group: 'lines' },
  { id: 'parallel-channel', label: 'Parallel Channel', group: 'channels' },
]

function makeController(initialActiveTool: string | null = null) {
  return createToolbarController({
    tools: fixtureTools,
    initialActiveTool,
  })
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('createToolbarController — construction', () => {
  it('exposes the provided tool list', () => {
    const c = makeController()
    expect(c.tools()).toEqual(fixtureTools)
  })

  it('defaults to a null active tool and empty disabled set', () => {
    const c = makeController()
    expect(c.activeTool()).toBeNull()
    expect(c.disabledTools().size).toBe(0)
  })

  it('honours initialActiveTool when provided', () => {
    const c = makeController('cursor')
    expect(c.activeTool()).toBe('cursor')
  })
})

// ---------------------------------------------------------------------------
// selectTool
// ---------------------------------------------------------------------------

describe('selectTool', () => {
  it('sets the active tool and notifies subscribers', () => {
    const c = makeController()
    const listener = vi.fn()
    c.activeTool.subscribe(listener)

    c.selectTool('cursor')
    expect(c.activeTool()).toBe('cursor')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('is a no-op for an unknown tool id', () => {
    const c = makeController('cursor')
    const listener = vi.fn()
    c.activeTool.subscribe(listener)

    c.selectTool('not-a-real-tool')
    expect(c.activeTool()).toBe('cursor')
    expect(listener).not.toHaveBeenCalled()
  })

  it('selecting a grouped tool replaces another tool in the same group', () => {
    const c = makeController()
    c.selectTool('trend-line')
    expect(c.activeTool()).toBe('trend-line')

    c.selectTool('ray')
    expect(c.activeTool()).toBe('ray')
  })

  it('does not affect tools in a different group', () => {
    const c = makeController()
    c.selectTool('trend-line')
    c.selectTool('parallel-channel')
    // Switching across groups is just a normal replace — only one tool
    // can ever be active overall.
    expect(c.activeTool()).toBe('parallel-channel')
  })

  it('selecting the already-active tool emits no notification', () => {
    const c = makeController('cursor')
    const listener = vi.fn()
    c.activeTool.subscribe(listener)

    c.selectTool('cursor')
    expect(c.activeTool()).toBe('cursor')
    expect(listener).not.toHaveBeenCalled()
  })

  it('refuses to select a disabled tool', () => {
    const c = makeController()
    c.setDisabled('trend-line', true)

    const listener = vi.fn()
    c.activeTool.subscribe(listener)

    c.selectTool('trend-line')
    expect(c.activeTool()).toBeNull()
    expect(listener).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// clearSelection
// ---------------------------------------------------------------------------

describe('clearSelection', () => {
  it('sets the active tool back to null', () => {
    const c = makeController('cursor')
    c.clearSelection()
    expect(c.activeTool()).toBeNull()
  })

  it('emits when clearing an active selection', () => {
    const c = makeController('cursor')
    const listener = vi.fn()
    c.activeTool.subscribe(listener)
    c.clearSelection()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when nothing is selected', () => {
    const c = makeController()
    const listener = vi.fn()
    c.activeTool.subscribe(listener)
    c.clearSelection()
    expect(listener).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// setDisabled
// ---------------------------------------------------------------------------

describe('setDisabled', () => {
  it('adds an id to the disabled set immutably', () => {
    const c = makeController()
    const before = c.disabledTools()
    c.setDisabled('trend-line', true)
    const after = c.disabledTools()
    expect(after.has('trend-line')).toBe(true)
    expect(before.has('trend-line')).toBe(false) // original set untouched
    expect(after).not.toBe(before)
  })

  it('removes an id when disabled = false', () => {
    const c = makeController()
    c.setDisabled('trend-line', true)
    c.setDisabled('trend-line', false)
    expect(c.disabledTools().has('trend-line')).toBe(false)
  })

  it('is idempotent — re-disabling does not emit', () => {
    const c = makeController()
    c.setDisabled('trend-line', true)
    const listener = vi.fn()
    c.disabledTools.subscribe(listener)
    c.setDisabled('trend-line', true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears the active selection when disabling the active tool', () => {
    const c = makeController('cursor')
    const activeListener = vi.fn()
    c.activeTool.subscribe(activeListener)

    c.setDisabled('cursor', true)
    expect(c.activeTool()).toBeNull()
    expect(activeListener).toHaveBeenCalledTimes(1)
  })

  it('leaves the active selection alone when disabling a different tool', () => {
    const c = makeController('cursor')
    c.setDisabled('trend-line', true)
    expect(c.activeTool()).toBe('cursor')
  })
})

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('dispose', () => {
  it('silences all mutators for previously-attached subscribers', () => {
    const c = makeController()

    const toolsListener = vi.fn()
    const activeListener = vi.fn()
    const disabledListener = vi.fn()
    c.tools.subscribe(toolsListener)
    c.activeTool.subscribe(activeListener)
    c.disabledTools.subscribe(disabledListener)

    c.dispose()

    c.selectTool('cursor')
    c.clearSelection()
    c.setDisabled('cursor', true)
    c.setDisabled('cursor', false)

    expect(toolsListener).not.toHaveBeenCalled()
    expect(activeListener).not.toHaveBeenCalled()
    expect(disabledListener).not.toHaveBeenCalled()
  })

  it('is idempotent', () => {
    const c = makeController()
    expect(() => {
      c.dispose()
      c.dispose()
      c.dispose()
    }).not.toThrow()
  })
})
