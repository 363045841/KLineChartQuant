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

  it('composites only the requested physical region and restores context state', () => {
    const { canvas, surface } = makeSurface()
    const target = {
      globalAlpha: 0.8,
      imageSmoothingEnabled: true,
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const region = { x: 10, y: 20, width: 100, height: 50, dpr: 2 }

    surface.compositeTo(target, region, { alpha: 0.5, imageSmoothingEnabled: false })

    expect(target.save).toHaveBeenCalledOnce()
    expect(target.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0)
    expect(target.drawImage).toHaveBeenCalledWith(canvas, 20, 40, 200, 100, 0, 0, 200, 100)
    expect(target.restore).toHaveBeenCalledOnce()
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
