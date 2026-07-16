import { SharedWebGLSurface } from '../../engine/renderers/webgl/sharedWebGLSurface'
import { createCanvas2DRenderer } from './createCanvas2DRenderer'
import { createWebGLRenderer } from './createWebGLRenderer'
import { createWebGLSurfaceBackend } from './createWebGLSurfaceBackend'
import { createWebGPURenderer } from './createWebGPURenderer'
import {
  createRendererHost,
  createRendererHostFromRenderer,
  type RendererBackend,
  type RendererHost,
  type RendererHostDependencies,
  type RendererHostListeners,
} from './rendererHost'
import type { Renderer } from './Renderer'

function createWebGLBackendRenderer(): Renderer {
  const shared = new SharedWebGLSurface()
  const surface = createWebGLSurfaceBackend(shared)
  if (!surface.isAvailable()) {
    surface.dispose()
    throw new Error('WebGL2 unavailable')
  }
  return createWebGLRenderer(surface, shared)
}

function createDependencies(hostRef: { current: RendererHost | null }): RendererHostDependencies {
  return {
    createWebGPU: () =>
      createWebGPURenderer({
        onDeviceLost: (info) => {
          void hostRef.current?.handleDeviceLost(info.message || 'WebGPU device lost')
        },
      }),
    createWebGL: createWebGLBackendRenderer,
    createCanvas: createCanvas2DRenderer,
  }
}

export async function createDefaultRendererHost(
  preference: RendererBackend,
  listeners: RendererHostListeners = {},
): Promise<RendererHost> {
  const hostRef = { current: null as RendererHost | null }
  const host = await createRendererHost(preference, createDependencies(hostRef))
  hostRef.current = host
  host.setListeners(listeners)
  return host
}

export function createDefaultRendererHostSync(
  listeners: RendererHostListeners = {},
): RendererHost {
  const hostRef = { current: null as RendererHost | null }
  const deps = createDependencies(hostRef)
  let renderer: Renderer
  let effective: RendererBackend
  let error: string | null = null
  try {
    renderer = createWebGLBackendRenderer()
    effective = 'webgl'
  } catch (cause) {
    renderer = createCanvas2DRenderer()
    effective = 'canvas'
    error = cause instanceof Error ? cause.message : String(cause)
  }
  const host = createRendererHostFromRenderer(
    'webgl',
    { renderer, effective, error },
    deps,
  )
  hostRef.current = host
  host.setListeners(listeners)
  return host
}
