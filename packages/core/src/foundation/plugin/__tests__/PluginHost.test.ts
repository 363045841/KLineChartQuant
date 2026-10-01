/** PluginHost Kernel 状态解析测试。 */
import { describe, expect, it } from 'vitest'

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
