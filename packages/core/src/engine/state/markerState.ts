import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { CustomMarkerEntity } from '../marker/registry'
import { deepFreezeSnapshot, immutableMap } from './immutable'

function snapshotMarker(marker: CustomMarkerEntity): CustomMarkerEntity {
  return deepFreezeSnapshot({ ...marker }) as CustomMarkerEntity
}

function mapsEqual(
  left: ReadonlyMap<string, CustomMarkerEntity>,
  right: ReadonlyMap<string, CustomMarkerEntity>,
): boolean {
  if (left.size !== right.size) return false
  for (const [id, marker] of right) {
    const prev = left.get(id)
    if (!prev) return false
    if (JSON.stringify(prev) !== JSON.stringify(marker)) return false
  }
  return true
}

export function createMarkerState() {
  const { signals, readonly } = createSubState({
    customMarkers: immutableMap(new Map<string, CustomMarkerEntity>()),
  })

  const write = (next: ReadonlyMap<string, CustomMarkerEntity>) => {
    const prev = signals.customMarkers.peek()
    if (mapsEqual(prev, next)) return
    signals.customMarkers.set(next)
  }

  return {
    readonly,
    actions: {
      setCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>) {
        const next = new Map<string, CustomMarkerEntity>()
        for (const marker of markers) {
          next.set(marker.id, snapshotMarker(marker))
        }
        write(immutableMap(next))
      },
      registerCustomMarker(marker: CustomMarkerEntity) {
        const next = new Map(signals.customMarkers.peek())
        next.set(marker.id, snapshotMarker(marker))
        write(immutableMap(next))
      },
      clearCustomMarkers() {
        if (signals.customMarkers.peek().size === 0) return
        write(immutableMap(new Map()))
      },
    },
    dispose() {
      batch(() => {
        signals.customMarkers.set(immutableMap(new Map()))
      })
    },
  }
}

export type MarkerStateModule = ReturnType<typeof createMarkerState>
