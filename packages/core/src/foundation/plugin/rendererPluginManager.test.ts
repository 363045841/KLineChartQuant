import { describe, expect, it, vi } from 'vitest'

import { RendererPluginManager } from './rendererPluginManager'

describe('RendererPluginManager lifecycle', () => {
  it('installs a renderer plugin exactly once', () => {
    const manager = new RendererPluginManager()
    const onInstall = vi.fn()
    manager.setPluginHost({} as never)

    manager.register({
      name: 'test',
      paneId: 'main',
      priority: 0,
      draw: vi.fn(),
      onInstall,
    })

    expect(onInstall).toHaveBeenCalledTimes(1)
  })
})

describe('RendererPluginManager transaction', () => {
  it('coalesces renderer invalidations into one callback', () => {
    const manager = new RendererPluginManager()
    const invalidate = vi.fn()
    manager.setInvalidateCallback(invalidate)
    const plugin = {
      name: 'test',
      paneId: 'main',
      priority: 0,
      draw: vi.fn(),
      setConfig: vi.fn(),
    }

    manager.transaction(() => {
      manager.register(plugin)
      manager.setEnabled(plugin.name, false)
      manager.updateConfig(plugin.name, { period: 10 })
    })

    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('flushes only when the outer transaction completes', () => {
    const manager = new RendererPluginManager()
    const invalidate = vi.fn()
    manager.setInvalidateCallback(invalidate)

    manager.transaction(() => {
      manager.transaction(() => {
        manager.register({ name: 'test', paneId: 'main', priority: 0, draw: vi.fn() })
      })
      expect(invalidate).not.toHaveBeenCalled()
    })

    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})
