/** 创建默认 RendererHost，并配置 WebGPU、WebGL 和 Canvas2D 的降级链。 */

import { createCanvas2DRenderer } from './backend/createCanvas2DRenderer.js'
import { createWebGLRenderer } from './backend/createWebGLRenderer.js'
import { createWebGPURenderer } from './backend/createWebGPURenderer.js'
import type { Renderer } from './Renderer.js'
import {
  createRendererHost,
  createRendererHostFromRenderer,
  type RendererBackend,
  type RendererHost,
  type RendererHostDependencies,
  type RendererHostListeners,
} from './rendererHost.js'

/** 后端工厂只创建原语执行器，不创建或挂载可见画布。 */
function createDependencies(hostRef: { current: RendererHost | null }): RendererHostDependencies {
  return {
    createWebGPU: () =>
      createWebGPURenderer({
        onDeviceLost: (info) => {
          void hostRef.current?.handleDeviceLost(info.message || 'WebGPU device lost')
        },
      }),
    createWebGL: createWebGLRenderer,
    createCanvas: createCanvas2DRenderer,
  }
}

export async function createDefaultRendererHost(
  preference: RendererBackend,
  listeners: RendererHostListeners = {},
): Promise<RendererHost> {
  const hostRef: { current: RendererHost | null } = { current: null }
  const host = await createRendererHost(preference, createDependencies(hostRef))
  hostRef.current = host
  host.setListeners(listeners)
  return host
}

export function createDefaultRendererHostSync(listeners: RendererHostListeners = {}): RendererHost {
  const hostRef: { current: RendererHost | null } = { current: null }
  const deps = createDependencies(hostRef)
  let renderer: Renderer
  let effective: RendererBackend
  let error: string | null = null
  try {
    renderer = createWebGLRenderer()
    effective = 'webgl'
  } catch (cause) {
    renderer = createCanvas2DRenderer()
    effective = 'canvas'
    error = cause instanceof Error ? cause.message : String(cause)
  }
  const host = createRendererHostFromRenderer('webgl', { renderer, effective, error }, deps)
  hostRef.current = host
  host.setListeners(listeners)
  return host
}
