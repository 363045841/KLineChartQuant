import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { PaneSpec } from '../chartTypes'
import type { ScaleType } from '../utils/tickPosition'
import { immutableMap } from './immutable'

function copyRatios(ratios: Readonly<Record<string, number>>): Record<string, number> {
  return { ...ratios }
}

function copySpecs(specs: ReadonlyArray<PaneSpec>): PaneSpec[] {
  return specs.map((spec) => ({
    ...spec,
    ...(spec.capabilities ? { capabilities: { ...spec.capabilities } } : {}),
  }))
}

function scaleMapsEqual(
  left: ReadonlyMap<string, ScaleType>,
  right: ReadonlyMap<string, ScaleType>,
): boolean {
  if (left.size !== right.size) return false
  for (const [id, type] of right) {
    if (left.get(id) !== type) return false
  }
  return true
}

export function createPaneState() {
  const { signals, readonly } = createSubState({
    paneRatios: {} as Record<string, number>,
    paneSpecs: [] as PaneSpec[],
    paneScaleTypes: immutableMap(new Map<string, ScaleType>()),
  })

  const writeScaleTypes = (next: ReadonlyMap<string, ScaleType>) => {
    if (scaleMapsEqual(signals.paneScaleTypes.peek(), next)) return
    signals.paneScaleTypes.set(next)
  }

  return {
    readonly,

    actions: {
      setPaneRatios(ratios: Record<string, number>) {
        signals.paneRatios.set(copyRatios(ratios))
      },

      setPaneSpecs(specs: PaneSpec[]) {
        signals.paneSpecs.set(copySpecs(specs))
      },

      /** ratios 与 specs 同批发布，避免中间态 */
      commitLayout(ratios: Readonly<Record<string, number>>, specs: ReadonlyArray<PaneSpec>) {
        batch(() => {
          signals.paneRatios.set(copyRatios(ratios))
          signals.paneSpecs.set(copySpecs(specs))
          // 新 pane 默认 linear；已有 scale 保留；已删除 pane 的 scale 剔除
          const prev = signals.paneScaleTypes.peek()
          const next = new Map<string, ScaleType>()
          for (const spec of specs) {
            next.set(spec.id, prev.get(spec.id) ?? 'linear')
          }
          writeScaleTypes(immutableMap(next))
        })
      },

      setPaneScaleType(paneId: string, scaleType: ScaleType) {
        const prev = signals.paneScaleTypes.peek()
        if (prev.get(paneId) === scaleType) return
        const next = new Map(prev)
        next.set(paneId, scaleType)
        writeScaleTypes(immutableMap(next))
      },

      replacePaneScaleTypes(types: ReadonlyMap<string, ScaleType>) {
        writeScaleTypes(immutableMap(new Map(types)))
      },

      removePaneScaleType(paneId: string) {
        const prev = signals.paneScaleTypes.peek()
        if (!prev.has(paneId)) return
        const next = new Map(prev)
        next.delete(paneId)
        writeScaleTypes(immutableMap(next))
      },
    },

    dispose() {
      batch(() => {
        signals.paneRatios.set({})
        signals.paneSpecs.set([])
        signals.paneScaleTypes.set(immutableMap(new Map()))
      })
    },
  }
}

export type PaneStateModule = ReturnType<typeof createPaneState>
