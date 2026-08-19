/** 验证 RendererHost 的后端降级、切换、设备丢失和销毁行为。 */

import { describe, expect, it, vi } from 'vitest'

import type { Renderer } from '../Renderer'
import { createCanvas2DRenderer } from '../backend/createCanvas2DRenderer'
import { createRendererHost, type RendererBackend } from '../rendererHost'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function makeRenderer(backend: RendererBackend): Renderer {
  const renderer = createCanvas2DRenderer()
  return {
    ...renderer,
    caps: { ...renderer.caps, name: backend === 'webgl' ? 'webgl2' : backend },
  }
}

describe('RendererHost', () => {
  it('degrades WebGPU to WebGL without changing the requested preference', async () => {
    const webgl = makeRenderer('webgl')
    const onRuntimeChange = vi.fn()
    const host = await createRendererHost('webgpu', {
      createWebGPU: async () => {
        throw new Error('adapter unavailable')
      },
      createWebGL: () => webgl,
      createCanvas: createCanvas2DRenderer,
      onRuntimeChange,
    })

    expect(host.renderer).toBe(webgl)
    expect(host.runtime).toEqual({
      effective: 'webgl',
      status: 'degraded',
      error: 'adapter unavailable',
    })
    expect(onRuntimeChange).toHaveBeenLastCalledWith(host.runtime)
  })

  it('degrades WebGL to Canvas when WebGL is unavailable', async () => {
    const host = await createRendererHost('webgl', {
      createWebGPU: () => makeRenderer('webgpu'),
      createWebGL: () => {
        throw new Error('WebGL2 unavailable')
      },
      createCanvas: createCanvas2DRenderer,
    })

    expect(host.renderer.caps.name).toBe('canvas2d')
    expect(host.runtime).toEqual({
      effective: 'canvas',
      status: 'degraded',
      error: 'WebGL2 unavailable',
    })
  })

  it('keeps the active renderer while a replacement is prepared', async () => {
    const pending = deferred<Renderer>()
    const webgl = makeRenderer('webgl')
    const webgpu = makeRenderer('webgpu')
    const host = await createRendererHost('webgl', {
      createWebGPU: () => pending.promise,
      createWebGL: () => webgl,
      createCanvas: createCanvas2DRenderer,
    })

    const switching = host.switchTo('webgpu')

    expect(host.renderer).toBe(webgl)
    expect(host.runtime.status).toBe('switching')

    pending.resolve(webgpu)
    await switching

    expect(host.renderer).toBe(webgpu)
    expect(host.runtime).toEqual({ effective: 'webgpu', status: 'ready', error: null })
  })

  it('preserves the surface size when switching renderers', async () => {
    const webgl = makeRenderer('webgl')
    const webgpu = makeRenderer('webgpu')
    const resizeWebGL = vi.spyOn(webgl.surface, 'resize')
    const resizeWebGPU = vi.spyOn(webgpu.surface, 'resize')
    const host = await createRendererHost('webgl', {
      createWebGPU: () => webgpu,
      createWebGL: () => webgl,
      createCanvas: createCanvas2DRenderer,
    })

    host.resize(960, 540, 1.5)
    await host.switchTo('webgpu')

    expect(resizeWebGL).toHaveBeenCalledWith(960, 540, 1.5)
    expect(resizeWebGPU).toHaveBeenCalledWith(960, 540, 1.5)
  })

  it('disposes a stale renderer created by an older switch', async () => {
    const pending = deferred<Renderer>()
    const stale = makeRenderer('webgpu')
    const staleDispose = vi.spyOn(stale, 'dispose')
    const host = await createRendererHost('canvas', {
      createWebGPU: () => pending.promise,
      createWebGL: () => makeRenderer('webgl'),
      createCanvas: createCanvas2DRenderer,
    })

    const oldSwitch = host.switchTo('webgpu')
    await host.switchTo('canvas')
    pending.resolve(stale)
    await oldSwitch

    expect(staleDispose).toHaveBeenCalledOnce()
    expect(host.runtime.effective).toBe('canvas')
  })

  it('disposes a renderer that arrives after the host is disposed', async () => {
    const pending = deferred<Renderer>()
    const late = makeRenderer('webgpu')
    const lateDispose = vi.spyOn(late, 'dispose')
    const host = await createRendererHost('canvas', {
      createWebGPU: () => pending.promise,
      createWebGL: () => makeRenderer('webgl'),
      createCanvas: createCanvas2DRenderer,
    })

    const switching = host.switchTo('webgpu')
    host.dispose()
    pending.resolve(late)
    await switching

    expect(lateDispose).toHaveBeenCalledOnce()
  })

  it('degrades the active WebGPU renderer after device loss', async () => {
    const webgpu = makeRenderer('webgpu')
    const webgl = makeRenderer('webgl')
    const host = await createRendererHost('webgpu', {
      createWebGPU: () => webgpu,
      createWebGL: () => webgl,
      createCanvas: createCanvas2DRenderer,
    })

    await host.handleDeviceLost('device reset')

    expect(host.renderer).toBe(webgl)
    expect(host.runtime).toEqual({
      effective: 'webgl',
      status: 'degraded',
      error: 'device reset',
    })
  })
})
