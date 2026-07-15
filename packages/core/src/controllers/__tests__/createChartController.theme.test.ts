// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChartController } from '../createChartController'
import { loadBuiltinIndicators } from '../../engine/indicators/registerBuiltins'

class ResizeObserverMock {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

function createCanvasContextStub() {
  return {
    setTransform: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
  } as unknown as CanvasRenderingContext2D
}

function createWebGLStub(): WebGL2RenderingContext {
  const noop = () => {}
  return new Proxy({} as unknown as WebGL2RenderingContext, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return 0
      if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => ''
      if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true
      if (prop === 'getError') return () => 0
      if (prop === 'getSupportedExtensions') return () => []
      if (prop === 'getContextAttributes') return () => ({})
      if (prop === 'getParameter') return () => 0
      if (prop === 'getUniformLocation' || prop === 'getAttribLocation') return () => 0
      if (prop.startsWith('create') || prop === 'getExtension') return () => ({ __webglStub: true })
      if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') return 300
      return noop
    },
  })
}

describe('createChartController mount theme', () => {
  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    HTMLCanvasElement.prototype.getContext = vi.fn((type: string) => {
      if (type === '2d') return createCanvasContextStub()
      if (type === 'webgl2' || type === 'webgl') return createWebGLStub()
      return null
    }) as never
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opts.theme light overrides settings default dark', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    document.body.appendChild(container)

    const ctrl = await createChartController({
      container,
      theme: 'light',
    })

    expect(ctrl.settings.peek().theme).toBe('light')
    expect(ctrl.theme.peek()).toBe('light')

    ctrl.dispose()
    container.remove()
  })

  it('without opts.theme keeps default dark preference', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    document.body.appendChild(container)

    const ctrl = await createChartController({ container })

    expect(ctrl.settings.peek().theme).toBe('dark')
    expect(ctrl.theme.peek()).toBe('dark')

    ctrl.dispose()
    container.remove()
  })
})
