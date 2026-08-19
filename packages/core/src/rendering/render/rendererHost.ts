/** 管理 Renderer 后端创建、切换、降级、尺寸同步和资源销毁。 */

import type { Renderer } from './Renderer'

export type RendererBackend = 'webgpu' | 'webgl' | 'canvas'

export type RendererBackendStatus = 'initializing' | 'ready' | 'switching' | 'degraded' | 'failed'

export type RendererBackendRuntime = {
  effective: RendererBackend
  status: RendererBackendStatus
  error: string | null
}

export type RendererFactory = () => Renderer | Promise<Renderer>

export type RendererHostDependencies = {
  createWebGPU: RendererFactory
  createWebGL: RendererFactory
  createCanvas: RendererFactory
  onRuntimeChange?: (runtime: Readonly<RendererBackendRuntime>) => void
  requestRedraw?: () => void
}

export type RendererHostListeners = Pick<
  RendererHostDependencies,
  'onRuntimeChange' | 'requestRedraw'
>

export interface RendererHost {
  readonly renderer: Renderer
  readonly runtime: Readonly<RendererBackendRuntime>
  resize(widthLogical: number, heightLogical: number, dpr: number): void
  switchTo(preference: RendererBackend): Promise<void>
  handleDeviceLost(error: string): Promise<void>
  setListeners(listeners: RendererHostListeners): void
  dispose(): void
}

export type PreparedRenderer = {
  renderer: Renderer
  effective: RendererBackend
  error: string | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function prepareRenderer(
  preference: RendererBackend,
  deps: RendererHostDependencies,
): Promise<PreparedRenderer> {
  const attempts: Array<[RendererBackend, RendererFactory]> =
    preference === 'webgpu'
      ? [
          ['webgpu', deps.createWebGPU],
          ['webgl', deps.createWebGL],
          ['canvas', deps.createCanvas],
        ]
      : preference === 'webgl'
        ? [
            ['webgl', deps.createWebGL],
            ['canvas', deps.createCanvas],
          ]
        : [['canvas', deps.createCanvas]]
  let firstError: string | null = null

  for (const [effective, factory] of attempts) {
    try {
      return {
        renderer: await factory(),
        effective,
        error: firstError,
      }
    } catch (error) {
      firstError ??= errorMessage(error)
    }
  }

  throw new Error(firstError ?? `Unable to create ${preference} renderer`)
}

export async function createRendererHost(
  preference: RendererBackend,
  deps: RendererHostDependencies,
): Promise<RendererHost> {
  const initial = await prepareRenderer(preference, deps)
  return createRendererHostFromRenderer(preference, initial, deps)
}

export function createRendererHostFromRenderer(
  preference: RendererBackend,
  initial: PreparedRenderer,
  deps: RendererHostDependencies,
): RendererHost {
  let activeRenderer = initial.renderer
  let runtime: RendererBackendRuntime = {
    effective: initial.effective,
    status: initial.effective === preference ? 'ready' : 'degraded',
    error: initial.error,
  }
  let generation = 0
  let disposed = false
  let surfaceSize: { widthLogical: number; heightLogical: number; dpr: number } | null = null
  let listeners: RendererHostListeners = {
    onRuntimeChange: deps.onRuntimeChange,
    requestRedraw: deps.requestRedraw,
  }

  function publish(next: RendererBackendRuntime): void {
    runtime = next
    listeners.onRuntimeChange?.(runtime)
  }

  const host: RendererHost = {
    get renderer() {
      return activeRenderer
    },
    get runtime() {
      return runtime
    },
    resize(widthLogical, heightLogical, dpr): void {
      if (disposed) return
      surfaceSize = { widthLogical, heightLogical, dpr }
      activeRenderer.surface.resize(widthLogical, heightLogical, dpr)
    },
    async switchTo(nextPreference): Promise<void> {
      if (disposed) return
      const requestGeneration = ++generation
      publish({ ...runtime, status: 'switching', error: null })

      let prepared: PreparedRenderer
      try {
        prepared = await prepareRenderer(nextPreference, deps)
      } catch (error) {
        if (disposed || requestGeneration !== generation) return
        publish({ ...runtime, status: 'degraded', error: errorMessage(error) })
        return
      }

      if (disposed || requestGeneration !== generation) {
        prepared.renderer.dispose()
        return
      }

      if (surfaceSize) {
        prepared.renderer.surface.resize(
          surfaceSize.widthLogical,
          surfaceSize.heightLogical,
          surfaceSize.dpr,
        )
      }

      const previous = activeRenderer
      activeRenderer = prepared.renderer
      publish({
        effective: prepared.effective,
        status: prepared.effective === nextPreference ? 'ready' : 'degraded',
        error: prepared.error,
      })
      listeners.requestRedraw?.()
      if (previous !== activeRenderer) previous.dispose()
    },
    async handleDeviceLost(error): Promise<void> {
      if (disposed || runtime.effective !== 'webgpu') return
      const requestGeneration = ++generation
      publish({ ...runtime, status: 'degraded', error })

      let prepared: PreparedRenderer
      try {
        prepared = await prepareRenderer('webgl', deps)
      } catch (fallbackError) {
        if (disposed || requestGeneration !== generation) return
        publish({ ...runtime, status: 'failed', error: errorMessage(fallbackError) })
        return
      }

      if (disposed || requestGeneration !== generation) {
        prepared.renderer.dispose()
        return
      }

      if (surfaceSize) {
        prepared.renderer.surface.resize(
          surfaceSize.widthLogical,
          surfaceSize.heightLogical,
          surfaceSize.dpr,
        )
      }

      const previous = activeRenderer
      activeRenderer = prepared.renderer
      publish({ effective: prepared.effective, status: 'degraded', error })
      listeners.requestRedraw?.()
      if (previous !== activeRenderer) previous.dispose()
    },
    setListeners(nextListeners): void {
      listeners = { ...nextListeners }
      listeners.onRuntimeChange?.(runtime)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      generation += 1
      activeRenderer.dispose()
    },
  }

  listeners.onRuntimeChange?.(runtime)
  return host
}
