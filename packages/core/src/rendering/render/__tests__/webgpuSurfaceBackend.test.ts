import { describe, expect, it, vi } from 'vitest'

import { createWebGPUSurfaceBackend } from '../createWebGPUSurfaceBackend'

function makeSurface() {
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ id: 'view' })) })),
  }
  const canvas = {
    width: 1,
    height: 1,
    style: { width: '', height: '' },
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement
  const device = {} as GPUDevice
  const surface = createWebGPUSurfaceBackend({ canvas, device, format: 'bgra8unorm' })
  return { canvas, context, device, surface }
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

  it('compositeTo is a no-op under hybrid DOM (M2)', () => {
    const { surface } = makeSurface()
    const target = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    surface.compositeTo(target, { x: 10, y: 20, width: 100, height: 50, dpr: 2 })

    expect(target.drawImage).not.toHaveBeenCalled()
  })

  it('clearRegion submits a transparent clear of the WebGPU canvas', () => {
    const context = {
      configure: vi.fn(),
      unconfigure: vi.fn(),
      getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ id: 'view' })) })),
    }
    const canvas = {
      width: 100,
      height: 50,
      style: { width: '', height: '' },
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement
    const pass = { end: vi.fn() }
    const encoder = {
      beginRenderPass: vi.fn(() => pass),
      finish: vi.fn(() => ({ kind: 'commands' })),
    }
    const queue = { submit: vi.fn() }
    const device = {
      createCommandEncoder: vi.fn(() => encoder),
      queue,
    } as unknown as GPUDevice
    const surface = createWebGPUSurfaceBackend({ canvas, device, format: 'bgra8unorm' })

    surface.clearRegion({ x: 0, y: 0, width: 100, height: 50, dpr: 1 })

    expect(device.createCommandEncoder).toHaveBeenCalledOnce()
    expect(encoder.beginRenderPass).toHaveBeenCalledWith(
      expect.objectContaining({
        colorAttachments: [
          expect.objectContaining({
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          }),
        ],
      }),
    )
    expect(pass.end).toHaveBeenCalledOnce()
    expect(queue.submit).toHaveBeenCalledOnce()
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
