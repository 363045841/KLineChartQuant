import { describe, expect, it, vi } from 'vitest'
import {
  type CommandDef,
  createCommandRegistry,
  formatCombo,
  scoreTextMatch,
} from '@/features/input/commands'

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

const inChart = { withinScope: true, editable: false }
const outside = { withinScope: false, editable: false }
const typing = { withinScope: true, editable: true }

function command(partial: Partial<CommandDef> & Pick<CommandDef, 'id'>): CommandDef {
  return { title: { zh: partial.id, en: partial.id }, run: vi.fn(), ...partial }
}

describe('createCommandRegistry', () => {
  it('registers commands, publishes them and unregisters through the disposer', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    const dispose = registry.register([command({ id: 'a' }), command({ id: 'b' })])
    expect(registry.commands.peek().map((c) => c.id)).toEqual(['a', 'b'])
    dispose()
    expect(registry.commands.peek()).toEqual([])
    expect(registry.shortcuts.shortcuts.peek()).toEqual([])
  })

  it('binds several shortcuts per command through the shortcut registry', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    const redo = command({ id: 'drawing.redo', shortcut: ['Mod+Shift+Z', 'Mod+Y'] })
    registry.register(redo)
    expect(registry.resolveKeyboardEvent(key('y', { ctrlKey: true }), inChart)).toBe(redo)
    expect(
      registry.resolveKeyboardEvent(key('Z', { ctrlKey: true, shiftKey: true }), inChart),
    ).toBe(redo)
  })

  it('throws on a combo conflict and leaves no partial bindings', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register(command({ id: 'a', shortcut: 'Mod+K' }))
    expect(() => registry.register(command({ id: 'b', shortcut: ['Mod+J', 'Mod+K'] }))).toThrow()
    expect(registry.get('b')).toBeNull()
    expect(registry.shortcuts.findByCombo('Mod+J')).toBeNull()
  })

  it('scopes chart shortcuts to the focused chart and lets global ones fire anywhere', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    const del = command({ id: 'drawing.delete', shortcut: 'Delete' })
    const palette = command({
      id: 'palette.open',
      shortcut: 'Mod+K',
      scope: 'global',
      allowInEditable: true,
    })
    registry.register([del, palette])
    expect(registry.resolveKeyboardEvent(key('Delete'), outside)).toBeNull()
    expect(registry.resolveKeyboardEvent(key('Delete'), inChart)).toBe(del)
    expect(registry.resolveKeyboardEvent(key('k', { ctrlKey: true }), outside)).toBe(palette)
  })

  it('ignores shortcuts while typing unless the command allows it', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register([
      command({ id: 'drawing.delete', shortcut: 'Delete' }),
      command({ id: 'palette.open', shortcut: 'Mod+K', allowInEditable: true }),
    ])
    expect(registry.resolveKeyboardEvent(key('Delete'), typing)).toBeNull()
    expect(registry.resolveKeyboardEvent(key('k', { ctrlKey: true }), typing)?.id).toBe(
      'palette.open',
    )
  })

  it('matches shifted punctuation registered without Shift (layout independent ?)', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    const help = command({ id: 'help.shortcuts', shortcut: '?' })
    registry.register(help)
    expect(registry.resolveKeyboardEvent(key('?', { shiftKey: true }), inChart)).toBe(help)
  })

  it('gates shortcuts, search and execute on when()', async () => {
    const registry = createCommandRegistry({ platform: 'win' })
    let enabled = false
    const run = vi.fn()
    registry.register(command({ id: 'drawing.undo', shortcut: 'Mod+Z', when: () => enabled, run }))
    expect(registry.resolveKeyboardEvent(key('z', { ctrlKey: true }), inChart)).toBeNull()
    expect(registry.search('undo')).toEqual([])
    expect(await registry.execute('drawing.undo')).toBe(false)
    enabled = true
    expect(await registry.execute('drawing.undo')).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })

  it('handleKeyboardEvent prevents default and runs the command', async () => {
    const registry = createCommandRegistry({ platform: 'mac' })
    const run = vi.fn()
    registry.register(command({ id: 'palette.open', shortcut: 'Mod+K', run }))
    const preventDefault = vi.fn()
    expect(
      registry.handleKeyboardEvent({ ...key('k', { metaKey: true }), preventDefault }, inChart),
    ).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(preventDefault).toHaveBeenCalled()
    expect(run).toHaveBeenCalled()
  })

  it('ranks search results by title, keyword and fuzzy subsequence', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register([
      command({ id: 'view.zoomIn', title: { zh: '放大', en: 'Zoom in' } }),
      command({
        id: 'settings.open',
        title: { zh: '打开设置', en: 'Open settings' },
        keywords: ['preferences'],
      }),
      command({ id: 'hidden', title: { zh: '隐藏', en: 'Hidden' }, palette: false }),
    ])
    expect(registry.search('zoom')[0]?.command.id).toBe('view.zoomIn')
    expect(registry.search('pref')[0]?.command.id).toBe('settings.open')
    expect(registry.search('设置')[0]?.command.id).toBe('settings.open')
    expect(registry.search('opst')[0]?.command.id).toBe('settings.open')
    expect(registry.search('hidden')).toEqual([])
    expect(registry.search('').length).toBe(2)
  })
})

describe('formatCombo / scoreTextMatch', () => {
  it('formats per platform', () => {
    expect(formatCombo('Mod+Shift+z', true)).toBe('⌘⇧Z')
    expect(formatCombo('Mod+K', false)).toBe('Ctrl+K')
    expect(formatCombo('Delete', false)).toBe('Del')
  })

  it('prefers prefix over substring over subsequence', () => {
    const prefix = scoreTextMatch('set', 'settings')
    const sub = scoreTextMatch('set', 'reset')
    const fuzzy = scoreTextMatch('stg', 'settings')
    expect(prefix).toBeGreaterThan(sub)
    expect(sub).toBeGreaterThan(fuzzy)
    expect(scoreTextMatch('xyz', 'settings')).toBe(0)
  })
})
