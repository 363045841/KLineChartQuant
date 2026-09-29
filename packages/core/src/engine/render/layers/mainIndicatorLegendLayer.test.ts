import { describe, expect, it, vi } from 'vitest'
import type { PluginHostImpl } from '@/foundation/plugin/index.js'

const plugin = vi.hoisted(() => ({
  name: 'mainIndicatorLegend',
  paneId: 'main',
  priority: 0,
  draw: vi.fn(),
  onInstall: vi.fn(),
}))

vi.mock('../../renderers/Indicator/mainIndicatorLegend', () => ({
  createMainIndicatorLegendRendererPlugin: vi.fn(() => plugin),
}))

import { createMainIndicatorLegendLayer } from './mainIndicatorLegendLayer.js'

describe('createMainIndicatorLegendLayer', () => {
  it('installs the plugin host on the legend renderer at construction', () => {
    const host = {} as PluginHostImpl
    createMainIndicatorLegendLayer(
      { yPaddingPx: 20 },
      () => null,
      (() => ({})) as never,
      () => host,
    )

    expect(plugin.onInstall).toHaveBeenCalledWith(host)
  })
})
