import type { RendererBackendRuntime } from '../../rendering/render/rendererHost'
import { createSubState } from '../../foundation/reactivity/signal'

function snapshot(runtime: RendererBackendRuntime): Readonly<RendererBackendRuntime> {
  return Object.freeze({ ...runtime })
}

function equal(left: RendererBackendRuntime, right: RendererBackendRuntime): boolean {
  return (
    left.effective === right.effective && left.status === right.status && left.error === right.error
  )
}

export function createRendererState(initial: RendererBackendRuntime) {
  const initialSnapshot = snapshot(initial)
  const { signals, readonly } = createSubState({ runtime: initialSnapshot })

  return {
    readonly,
    actions: {
      setRuntime(runtime: RendererBackendRuntime): void {
        if (equal(signals.runtime.peek(), runtime)) return
        signals.runtime.set(snapshot(runtime))
      },
    },
    dispose(): void {
      signals.runtime.set(initialSnapshot)
    },
  }
}

export type RendererStateModule = ReturnType<typeof createRendererState>
