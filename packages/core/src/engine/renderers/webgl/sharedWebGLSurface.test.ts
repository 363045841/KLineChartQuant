/** 验证共享 WebGL 画布的帧级状态边界。 */

import { describe, expect, it, vi } from 'vitest'

import { SharedWebGLSurface } from './sharedWebGLSurface.js'

/** 创建帧结束所需的最小 WebGL2 mock。 */
function createMockGl() {
  return {
    SCISSOR_TEST: 1,
    READ_FRAMEBUFFER: 2,
    DRAW_FRAMEBUFFER: 3,
    COLOR_BUFFER_BIT: 4,
    NEAREST: 5,
    FRAMEBUFFER_COMPLETE: 6,
    RENDERBUFFER: 7,
    RGBA8: 8,
    COLOR_ATTACHMENT0: 9,
    MAX_SAMPLES: 10,
    bindFramebuffer: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    viewport: vi.fn(),
    scissor: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    blitFramebuffer: vi.fn(),
    getParameter: vi.fn(() => 4),
    createFramebuffer: vi.fn(() => ({})),
    createRenderbuffer: vi.fn(() => ({})),
    bindRenderbuffer: vi.fn(),
    renderbufferStorageMultisample: vi.fn(),
    framebufferRenderbuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 6),
    deleteFramebuffer: vi.fn(),
    deleteRenderbuffer: vi.fn(),
  }
}

describe('SharedWebGLSurface', () => {
  it('rejects pane binding outside an active frame', () => {
    const gl = createMockGl()
    const canvas = {
      width: 800,
      height: 600,
      getContext: vi.fn(() => gl),
    } as unknown as HTMLCanvasElement
    const surface = new SharedWebGLSurface(canvas)

    expect(surface.bindRegion({ x: 0, y: 0, width: 800, height: 300, dpr: 1 })).toBe(false)
    expect(gl.bindFramebuffer).not.toHaveBeenCalled()
  })

  it('resets the last pane scissor before resolving the complete frame', () => {
    const gl = createMockGl()
    const canvas = {
      width: 800,
      height: 600,
      getContext: vi.fn(() => gl),
    } as unknown as HTMLCanvasElement
    const surface = new SharedWebGLSurface(canvas)
    const internals = surface as unknown as {
      msaaTargets: {
        widthPx: number
        heightPx: number
        framebuffer: WebGLFramebuffer
      }
      frameActive: boolean
    }
    internals.msaaTargets = {
      widthPx: 800,
      heightPx: 600,
      framebuffer: {} as WebGLFramebuffer,
    }
    internals.frameActive = true

    surface.endFrame()

    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST)
    expect(gl.disable.mock.invocationCallOrder[0]).toBeLessThan(
      gl.blitFramebuffer.mock.invocationCallOrder[0]!,
    )
    expect(gl.blitFramebuffer).toHaveBeenCalledWith(0, 0, 800, 600, 0, 0, 800, 600, 4, 5)
  })

  it('keeps multiple panes in one frame and resolves once after the final pane', () => {
    const gl = createMockGl()
    const canvas = {
      width: 800,
      height: 600,
      getContext: vi.fn(() => gl),
    } as unknown as HTMLCanvasElement
    const surface = new SharedWebGLSurface(canvas)

    expect(surface.beginFrame({ clear: true })).toBe(true)
    expect(surface.bindRegion({ x: 0, y: 0, width: 800, height: 400, dpr: 1 })).toBe(true)
    expect(surface.bindRegion({ x: 0, y: 400, width: 800, height: 200, dpr: 1 })).toBe(true)
    surface.endFrame()

    expect(gl.clear).toHaveBeenCalledOnce()
    expect(gl.blitFramebuffer).toHaveBeenCalledOnce()
    expect(gl.scissor).toHaveBeenNthCalledWith(1, 0, 200, 800, 400)
    expect(gl.scissor).toHaveBeenNthCalledWith(2, 0, 0, 800, 200)
  })
})
