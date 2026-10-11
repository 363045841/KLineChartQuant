import type { CSSProperties } from 'vue'
import type { AnchoredPlacement } from './types.js'

type FloatingBackend = Pick<
  typeof import('@floating-ui/dom'),
  'autoUpdate' | 'computePosition' | 'flip' | 'offset' | 'shift' | 'size'
>

interface FloatingPositionOptions {
  trigger: HTMLElement
  panel: HTMLElement
  placement: AnchoredPlacement
  offset: number
  matchTriggerWidth: boolean
  maxHeight?: string
  apply(style: CSSProperties): void
  onError(error: unknown): void
}

const VIEWPORT_PADDING = 8

async function loadBackend(): Promise<FloatingBackend> {
  const { autoUpdate, computePosition, flip, offset, shift, size } = await import(
    '@floating-ui/dom'
  )
  return { autoUpdate, computePosition, flip, offset, shift, size }
}

/** Import, observation and in-flight measurements share a single cancellation lifetime. */
export async function startFloatingPosition(
  options: FloatingPositionOptions,
  signal: AbortSignal,
  load: () => Promise<FloatingBackend> = loadBackend,
): Promise<void> {
  try {
    const backend = await load()
    if (signal.aborted) return
    let request = 0

    async function update(): Promise<void> {
      const current = ++request
      let constraints: CSSProperties = {}
      try {
        const position = await backend.computePosition(options.trigger, options.panel, {
          strategy: 'fixed',
          placement: options.placement === 'top' ? 'top-start' : 'bottom-start',
          middleware: [
            backend.offset(options.offset),
            options.placement === 'auto' ? backend.flip({ padding: VIEWPORT_PADDING }) : undefined,
            backend.shift({ padding: VIEWPORT_PADDING }),
            backend.size({
              padding: VIEWPORT_PADDING,
              apply({ availableHeight, rects }) {
                const height = `${Math.max(0, availableHeight)}px`
                constraints = {
                  maxHeight: options.maxHeight ? `min(${options.maxHeight}, ${height})` : height,
                  minWidth: options.matchTriggerWidth ? `${rects.reference.width}px` : undefined,
                }
              },
            }),
          ],
        })
        if (signal.aborted || current !== request) return
        options.apply({
          ...constraints,
          top: `${Math.round(position.y)}px`,
          left: `${Math.round(position.x)}px`,
        })
      } catch (error) {
        if (!signal.aborted && current === request) options.onError(error)
      }
    }

    const cleanup = backend.autoUpdate(options.trigger, options.panel, () => {
      void update()
    })
    if (signal.aborted) cleanup()
    else signal.addEventListener('abort', cleanup, { once: true })
  } catch (error) {
    if (!signal.aborted) options.onError(error)
  }
}
