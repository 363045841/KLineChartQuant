import { describe, expect, it, vi } from 'vitest'

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

import { createMainIndicatorLegendLayer } from './mainIndicatorLegendLayer'

describe('createMainIndicatorLegendLayer', () => {
  it('leaves plugin installation to RendererPluginManager', () => {
    createMainIndicatorLegendLayer(
      { yPaddingPx: 20 },
      () => null,
    )

    expect(plugin.onInstall).not.toHaveBeenCalled()
  })
})
