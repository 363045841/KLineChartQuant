// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasGetContextMock,
  ResizeObserverMock,
  stubAnimationFrame,
} from '@/engine/__tests__/helpers/chartDomTestKit'

import { loadBuiltinIndicators } from '../../engine/indicators/registerBuiltins'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId'
import type { RenderContext } from '../../foundation/plugin/types'
import type { Layer } from '../../rendering/scene/types'
import { createChartController } from '../createChartController'
import type { KLineData } from '../types'

function createBars(length = 30): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: (index + 1) * 60_000,
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 100,
  }))
}

/** Layer 形态 stub：id 走 `plugin:${name}` 约定，getRenderer/removeRenderer 可按名称寻址。 */
function createStubLayer(name: string): Layer<RenderContext> {
  return {
    id: makePluginLayerId(name),
    role: 'overlay',
    pane: 'main',
    z: 0,
    visible: true,
    paint: () => {},
    dispose: () => {},
  }
}

async function mountController() {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
  document.body.appendChild(container)
  const ctrl = await createChartController({ container, data: createBars() })
  return {
    ctrl,
    cleanup: () => {
      ctrl.dispose()
      container.remove()
    },
  }
}

describe('createChartController renderer layer registration', () => {
  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubAnimationFrame()
    HTMLCanvasElement.prototype.getContext = createCanvasGetContextMock()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('useRenderer registers and getRenderer returns the same layer instance', async () => {
    const { ctrl, cleanup } = await mountController()
    const layer = createStubLayer('test_overlay')

    ctrl.useRenderer(layer)

    expect(ctrl.getRenderer('test_overlay')).toBe(layer)
    cleanup()
  })

  it('useRenderer is idempotent by layer id (existing instance is kept)', async () => {
    const { ctrl, cleanup } = await mountController()
    const first = createStubLayer('dup_overlay')
    const second = createStubLayer('dup_overlay')

    ctrl.useRenderer(first)
    ctrl.useRenderer(second)

    expect(ctrl.getRenderer('dup_overlay')).toBe(first)
    cleanup()
  })

  it('removeRenderer unregisters the layer by name', async () => {
    const { ctrl, cleanup } = await mountController()

    ctrl.useRenderer(createStubLayer('removable'))
    ctrl.removeRenderer('removable')

    expect(ctrl.getRenderer('removable')).toBeUndefined()
    cleanup()
  })
})
