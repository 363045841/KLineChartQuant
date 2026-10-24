// @vitest-environment jsdom
/** GPU 原语调度回归：文字批次整批走 Canvas，纯几何批次只做一次离屏合成。 */
import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { createGpuPrimitiveBackend, type PrimitiveDevice } from '../impl/gpu.js'
import type { PaintPrimitive } from '../types.js'

/** 构造只记录调用的离屏设备；合成画布使用 jsdom 元素。 */
function createDevice() {
  const render = vi.fn<PrimitiveDevice['render']>(() => ({
    canvas: document.createElement('canvas'),
    metrics: { drawCalls: 1, uploads: 0, uploadedBytes: 0, submissions: 1 },
  }))
  const device: PrimitiveDevice = {
    render,
    waitForIdle: async () => {},
    dispose: vi.fn(),
  }
  return { device, render }
}

/** 构造满足 GPU 后端入口校验的目标：物理尺寸与 ownerDocument 来自 jsdom。 */
function createTarget() {
  return createMockCanvasContext({
    canvas: { width: 800, height: 600, ownerDocument: document },
  })
}

describe('createGpuPrimitiveBackend text batches', () => {
  /** 含文字的批次必须整批交给 Canvas：不创建设备、不做离屏合成，且保留原语顺序。 */
  it('replays a text-containing batch with Canvas in one ordered pass', () => {
    const { device, render } = createDevice()
    const create = vi.fn(() => device)
    const backend = createGpuPrimitiveBackend(create)
    const target = createTarget()
    const primitives: PaintPrimitive[] = [
      { kind: 'rect', x: 0, y: 0, width: 400, height: 400, color: '#ff0000' },
      {
        kind: 'text',
        text: 'label',
        x: 10,
        y: 20,
        font: '12px sans-serif',
        color: '#00ff00',
        align: 'left',
        baseline: 'top',
      },
      { kind: 'circle', x: 50, y: 50, radius: 5, color: '#0000ff' },
    ]

    expect(backend.paint(target, primitives, 1)).toBe(true)

    expect(create).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
    expect(backend.getMetrics?.()).toMatchObject({ primitives: 3, compositions: 0, drawCalls: 0 })
    // 矩形 → 文字 → 圆：Canvas 单次重放保持交错顺序，几何不会整体压到文字之后。
    const order = [target.fillRect, target.fillText, target.arc].map(
      (method) => vi.mocked(method).mock.invocationCallOrder[0]!,
    )
    expect(order[0]).toBeLessThan(order[1]!)
    expect(order[1]).toBeLessThan(order[2]!)
  })

  /** 纯几何批次只做一次准备、一次离屏渲染与一次整张合成。 */
  it('composites a pure geometry batch exactly once', () => {
    const { device, render } = createDevice()
    const backend = createGpuPrimitiveBackend(() => device)
    const target = createTarget()
    const primitives: PaintPrimitive[] = [
      { kind: 'rect', x: 0, y: 0, width: 400, height: 400, color: '#ff0000' },
      { kind: 'rect', x: 400, y: 200, width: 400, height: 400, color: '#00ff00' },
    ]

    expect(backend.paint(target, primitives, 1)).toBe(true)

    expect(render).toHaveBeenCalledOnce()
    expect(backend.getMetrics?.()).toMatchObject({ compositions: 1, drawCalls: 1 })
    expect(target.drawImage).toHaveBeenCalledOnce()
    expect(target.fillRect).not.toHaveBeenCalled()
  })
})
