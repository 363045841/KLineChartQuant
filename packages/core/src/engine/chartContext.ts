import type { Viewport, PaneSpec } from './chartTypes'

export type ChartEventMap = {
  'data:changed': { prevLength: number; newLength: number }
  'viewport:changed': { vp: Viewport }
  'layout:changed': { specs: PaneSpec[] }
  'zoom:changed': { level: number }
  'indicators:changed': {}
}

export class ChartEventBus {
  private listeners = new Map<string, Set<Function>>()

  on<K extends keyof ChartEventMap>(
    event: K,
    handler: (payload: ChartEventMap[K]) => void,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }

  emit<K extends keyof ChartEventMap>(event: K, payload: ChartEventMap[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload))
  }

  clear(): void {
    this.listeners.clear()
  }
}
