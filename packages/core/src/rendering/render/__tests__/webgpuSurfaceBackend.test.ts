/** 验证 WebGPU SurfaceBackend 的 canvas 配置、尺寸、清屏和生命周期。 */

import { describe, expect, it } from 'vitest'

import { createWebGPUSurfaceBackend } from '../backend/createWebGPUSurfaceBackend'
import { createMockCanvas2DContext } from './helpers/rendererTestKit'
import { createMockWebGPU } from './helpers/webgpuTestKit'

/** 构造 SurfaceBackend 与可观测的 canvas / context / device 替身。 */
function makeSurface() {
  const fake = createMockWebGPU()
  const surface = createWebGPUSurfaceBackend({
    canvas: fake.canvas,
    device: fake.device,
    format: 'bgra8unorm',
  })
  return { ...fake, surface }
}

describe('createWebGPUSurfaceBackend', () => {
  it('configures a premultiplied WebGPU canvas', () => {
    const { context, device } = makeSurface()

    expect(context.configure).toHaveBeenCalledWith({
      device,
      format: 'bgra8unorm',
      alphaMode: 'premultiplied',
      usage: 0x10,
    })
  })

  it('resizes the backing canvas using DPR and binds a logical region', () => {
    const { canvas, surface } = makeSurface()

    surface.resize(320, 180, 1.5)

    expect(canvas.width).toBe(480)
    expect(canvas.height).toBe(270)
    expect(surface.bindRegion({ x: 10, y: 20, width: 100, height: 50, dpr: 1.5 })).toBe(true)
    expect(surface.getBoundRegion()).toEqual({ x: 10, y: 20, width: 100, height: 50, dpr: 1.5 })
  })

  it('sets CSS size on resize for hybrid DOM mounting', () => {
    const { canvas, surface } = makeSurface()

    surface.resize(320, 180, 1.5)

    expect(canvas.style.width).toBe('320px')
    expect(canvas.style.height).toBe('180px')
  })

  it('derives CSS size from the rounded backing buffer', () => {
    const { canvas, surface } = makeSurface()

    surface.resize(101.2, 80.4, 1.25)

    expect(canvas.width).toBe(127)
    expect(canvas.height).toBe(101)
    expect(canvas.style.width).toBe('101.6px')
    expect(canvas.style.height).toBe('80.8px')
  })

  it('compositeTo is a no-op under hybrid DOM (M2)', () => {
    const { surface } = makeSurface()
    const target = createMockCanvas2DContext()

    surface.compositeTo(target, { x: 10, y: 20, width: 100, height: 50, dpr: 2 })

    expect(target.drawImage).not.toHaveBeenCalled()
  })

  it('clearRegion submits a transparent clear of the WebGPU canvas', () => {
    const fake = createMockWebGPU()
    const surface = createWebGPUSurfaceBackend({
      canvas: fake.canvas,
      device: fake.device,
      format: 'bgra8unorm',
    })

    surface.clearRegion({ x: 0, y: 0, width: 100, height: 50, dpr: 1 })

    expect(fake.device.createCommandEncoder).toHaveBeenCalledOnce()
    expect(fake.renderPassDescriptors[0]).toMatchObject({
      colorAttachments: [
        expect.objectContaining({
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }),
      ],
    })
    expect(fake.passes[0]?.end).toHaveBeenCalledOnce()
    expect(fake.queue.submit).toHaveBeenCalledOnce()
  })

  it('unconfigures once and rejects work after dispose', () => {
    const { context, surface } = makeSurface()

    surface.dispose()
    surface.dispose()

    expect(context.unconfigure).toHaveBeenCalledOnce()
    expect(surface.isAvailable()).toBe(false)
    expect(surface.bindRegion({ x: 0, y: 0, width: 10, height: 10, dpr: 1 })).toBe(false)
  })
})
