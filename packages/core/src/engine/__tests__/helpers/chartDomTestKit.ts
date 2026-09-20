/**
 * Chart DOM 集成测试的共享夹具：canvas getContext、WebGL stub、ResizeObserver 与容器构造。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：DOM 类型（CanvasRenderingContext2D / WebGL2RenderingContext）无法完整实现，
 * 强转只集中在本夹具内；项目自有类型 ChartDom 用 satisfies 全量约束。
 */
import { vi } from 'vitest'

import type { ChartDom } from '@/core/chart'

import { createMockCanvasContext } from './renderTestKit'

/** 可编排的 ResizeObserver 替身：记录实例、支持触发回调、可选择拒绝 device-pixel-content-box。 */
export class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []
  static failWithDevicePixelBox = false

  private callback: ResizeObserverCallback
  observe = vi.fn((_target: Element, options?: ResizeObserverOptions) => {
    if (options?.box === 'device-pixel-content-box' && ResizeObserverMock.failWithDevicePixelBox) {
      throw new Error('device-pixel-content-box not supported')
    }
  })
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  /** 触发一次 resize 回调。 */
  emit(entry: Partial<ResizeObserverEntry>) {
    this.callback([entry as ResizeObserverEntry], this as unknown as ResizeObserver)
  }

  /** 清空实例与失败开关。 */
  static reset() {
    ResizeObserverMock.instances = []
    ResizeObserverMock.failWithDevicePixelBox = false
  }
}

/**
 * 构造 WebGL2 context 的最小可用 stub。
 * 常量返回 0，创建/查询类方法返回可辨对象，其余方法为 noop。
 */
export function createWebGLContextStub(): WebGL2RenderingContext {
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
  }) as WebGL2RenderingContext
}

/**
 * 构造 HTMLCanvasElement.getContext 替身：2d 返回可观测 Canvas2D，WebGL 返回 context stub。
 */
export function createCanvasGetContextMock(): typeof HTMLCanvasElement.prototype.getContext {
  return vi.fn((type: string) => {
    if (type === '2d') return createMockCanvasContext()
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      return createWebGLContextStub()
    }
    return null
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext
}

/** 构造带尺寸与分层子节点的 Chart DOM。 */
export function createChartDom(width: number, height: number): ChartDom {
  const container = document.createElement('div')
  const canvasLayer = document.createElement('div')
  const rightAxisLayer = document.createElement('div')
  const xAxisCanvas = document.createElement('canvas')

  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: height })
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 })

  container.appendChild(canvasLayer)
  container.appendChild(rightAxisLayer)
  canvasLayer.appendChild(xAxisCanvas)

  return { container, canvasLayer, rightAxisLayer, xAxisCanvas } satisfies ChartDom
}

/** 安装同步的 requestAnimationFrame / cancelAnimationFrame 替身。 */
export function stubAnimationFrame(): void {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
}
