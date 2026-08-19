/** PluginHost Kernel 状态解析测试。 */
import { describe, expect, it } from 'vitest'

import { createPluginHost } from './PluginHost'

describe('PluginHostImpl shared-state resolver', () => {
  it('prefers a Kernel-provided indicator state and preserves StateStore fallback', () => {
    const host = createPluginHost()
    const kernelState = { timestamp: 1, series: [1, 2, 3] }
    const pluginState = { timestamp: 2, series: [4, 5, 6] }
    host.setSharedState('plugin:standalone', pluginState)
    host.setSharedStateResolver((key) => (key === 'indicator:ma:main' ? kernelState : undefined))

    expect(host.getSharedState('indicator:ma:main')).toBe(kernelState)
    expect(host.getSharedState('plugin:standalone')).toBe(pluginState)
  })
})
