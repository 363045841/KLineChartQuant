/**
 * 命令注册表测试：注册/注销、多快捷键、冲突与批量回滚、作用域、可编辑、
 * 门控、按键分发、检索排序与展示格式化。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  type CommandDef,
  createCommandRegistry,
  formatCombo,
  primaryShortcut,
  scoreTextMatch,
} from '..'

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

/** 构造命令，标题默认取 id，run 默认 spy。 */
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
    const registered = registry.get(redo.id)
    expect(registry.resolveKeyboardEvent(key('y', { ctrlKey: true }), inChart)).toBe(registered)
    expect(
      registry.resolveKeyboardEvent(key('Z', { ctrlKey: true, shiftKey: true }), inChart),
    ).toBe(registered)
  })

  it('updates a command shortcut and exposes it in search', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    const undo = command({
      id: 'drawing.undo',
      title: { zh: '撤销', en: 'Undo' },
      shortcut: 'Mod+Z',
    })
    const dispose = registry.register([undo, command({ id: 'drawing.redo', shortcut: 'Mod+Y' })])
    registry.setShortcut('drawing.undo', 'Mod+U')
    expect(registry.commands.peek().map((item) => item.id)).toEqual([
      'drawing.undo',
      'drawing.redo',
    ])
    expect(registry.resolveKeyboardEvent(key('z', { ctrlKey: true }), inChart)).toBeNull()
    expect(registry.resolveKeyboardEvent(key('u', { ctrlKey: true }), inChart)?.id).toBe(
      'drawing.undo',
    )
    expect(registry.search('Ctrl+U')[0]?.command.id).toBe('drawing.undo')
    dispose()
    expect(registry.get('drawing.undo')).toBeNull()
    expect(registry.shortcuts.findByCombo('Mod+U')).toBeNull()
  })

  it('throws on a combo conflict and leaves no partial bindings', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register(command({ id: 'a', shortcut: 'Mod+K' }))
    expect(() => registry.register(command({ id: 'b', shortcut: ['Mod+J', 'Mod+K'] }))).toThrow()
    expect(registry.get('b')).toBeNull()
    expect(registry.shortcuts.findByCombo('Mod+J')).toBeNull()
  })

  it('preserves existing commands and bindings without publishing a failed batch', () => {
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register(command({ id: 'a', shortcut: 'Mod+K' }))
    const original = registry.get('a')
    const published = vi.fn()
    registry.commands.subscribe(published)
    registry.shortcuts.shortcuts.subscribe(published)
    expect(() =>
      registry.register([
        command({ id: 'a', shortcut: 'Mod+J' }),
        command({ id: 'b', shortcut: 'Mod+L' }),
        command({ id: 'c', shortcut: 'Mod+J' }),
      ]),
    ).toThrow()
    expect(registry.get('b')).toBeNull()
    expect(registry.get('c')).toBeNull()
    expect(registry.shortcuts.findByCombo('Mod+L')).toBeNull()
    expect(registry.get('a')).toBe(original)
    expect(registry.resolveKeyboardEvent(key('k', { ctrlKey: true }), inChart)).toBe(original)
    expect(published).not.toHaveBeenCalled()
    expect('register' in registry.shortcuts).toBe(false)
  })

  it('throws to direct callers and isolates errors at keyboard dispatch', async () => {
    const onError = vi.fn()
    const registry = createCommandRegistry({ onError, platform: 'win' })
    const error = new Error('Command failed')
    const fail = () => { throw error }
    const run = vi.fn()
    registry.register([
      command({ id: 'gate', shortcut: 'A', when: fail }),
      command({ id: 'run', shortcut: 'B', run: fail }),
      command({ id: 'healthy', shortcut: 'C', run }),
    ])
    await expect(registry.execute('gate')).rejects.toBe(error)
    await expect(registry.execute('run')).rejects.toBe(error)
    expect(registry.handleKeyboardEvent(key('a'), inChart)).toBe(false)
    expect(registry.handleKeyboardEvent(key('b'), inChart)).toBe(true)
    expect(registry.handleKeyboardEvent(key('c'), inChart)).toBe(true)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2))
    expect(run).toHaveBeenCalledOnce()
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
    expect(registry.resolveKeyboardEvent(key('Delete'), inChart)?.id).toBe(del.id)
    expect(registry.resolveKeyboardEvent(key('k', { ctrlKey: true }), outside)?.id).toBe(palette.id)
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
    expect(registry.resolveKeyboardEvent(key('?', { shiftKey: true }), inChart)?.id).toBe(help.id)
  })

  it('gates shortcuts, search and execute on when()', async () => {
    const registry = createCommandRegistry({ platform: 'win' })
    let enabled = false
    const run = vi.fn()
    registry.register(command({ id: 'drawing.undo', shortcut: 'Mod+Z', when: () => enabled, run }))
    expect(registry.resolveKeyboardEvent(key('z', { ctrlKey: true }), inChart)).toBeNull()
    const matches = registry.search('undo')
    expect(matches.map((match) => match.command.id)).toEqual(['drawing.undo'])
    expect(matches[0]?.available).toBe(false)
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

describe('formatCombo / scoreTextMatch / primaryShortcut', () => {
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

  it('returns the first shortcut combo', () => {
    expect(primaryShortcut(command({ id: 'a', shortcut: ['Mod+K', 'Mod+J'] }))).toBe('Mod+K')
    expect(primaryShortcut(command({ id: 'b' }))).toBeNull()
  })
})
