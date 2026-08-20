/** PluginHost Kernel 状态解析测试。 */
import { describe, expect, it } from 'vitest'

import { createPluginHost } from './PluginHost'

describe('PluginHostImpl shared state', () => {
  it('reads plugin state from StateStore', () => {
    const host = createPluginHost()
    const pluginState = { timestamp: 2, series: [4, 5, 6] }
    host.setSharedState('plugin:standalone', pluginState)

    expect(host.getSharedState('plugin:standalone')).toBe(pluginState)
  })
})
