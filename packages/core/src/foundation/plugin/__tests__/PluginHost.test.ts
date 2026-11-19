/** PluginHost Kernel 状态解析测试。 */
import { describe, expect, it, vi } from 'vitest'

import { createPluginHost } from '../impl/PluginHost.js'

describe('PluginHostImpl shared state', () => {
  it('reads plugin state from StateStore', () => {
    const host = createPluginHost()
    const pluginState = { timestamp: 2, series: [4, 5, 6] }
    host.setSharedState('plugin:standalone', pluginState)

    expect(host.getSharedState('plugin:standalone')).toBe(pluginState)
  })
})

describe('PluginHostImpl lifecycle', () => {
  it('rejects failed installs, releases owned state and accepts a retry', async () => {
    const host = createPluginHost()
    const error = new Error('afterInstall failed')
    const fail = () => { throw error }
    const uninstall = vi.fn()
    const plugin = {
      name: 'retryable',
      version: '1.0.0',
      install: () => host.setSharedState('result', { timestamp: 1 }, 'retryable'),
      uninstall,
    }
    host.hooks.tap('plugin:afterInstall', fail)
    await expect(host.use(plugin)).rejects.toBe(error)
    expect(uninstall).toHaveBeenCalledOnce()
    expect(host.getPlugin(plugin.name)).toBeUndefined()
    expect(host.getSharedState('result')).toBeUndefined()
    host.hooks.untap('plugin:afterInstall', fail)
    await host.use(plugin)
    await host.remove(plugin.name)
    expect(host.getSharedState('result')).toBeUndefined()
  })

  it('reports async event rejection and delivers the same event to other listeners', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const host = createPluginHost(logger)
    const error = new Error('callback failed')
    const received = vi.fn()
    host.events.once('test', async () => { throw error })
    host.events.on('test', received)
    host.events.emit('test', 1)
    expect(received).toHaveBeenCalledWith(1)
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('test'), error))
  })

  it('serializes removal with destruction and rejects new installations during shutdown', async () => {
    const host = createPluginHost()
    let finishUninstall!: () => void
    const waiting = new Promise<void>((resolve) => {
      finishUninstall = resolve
    })
    let uninstalls = 0
    await host.use({
      name: 'async-plugin',
      version: '1.0.0',
      install() {},
      async uninstall() {
        uninstalls++
        await waiting
      },
    })
    const removal = host.remove('async-plugin')
    const destruction = host.destroy()
    expect(host.destroy()).toBe(destruction)
    await expect(
      host.use({ name: 'late-plugin', version: '1.0.0', install() {} }),
    ).rejects.toThrow()
    finishUninstall()
    await removal
    await destruction
    expect(uninstalls).toBe(1)
    expect(host.getPlugins()).toEqual([])
  })
})
