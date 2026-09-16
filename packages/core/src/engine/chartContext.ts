import type { PaneSpec, Viewport } from './chartTypes.js'

export type ChartEventMap = {
  'data:changed': { prevLength: number; newLength: number }
  'viewport:changed': { vp: Viewport }
  'layout:changed': { specs: PaneSpec[] }
  'zoom:changed': { level: number }
  'indicators:changed': Record<string, never>
}

/** 事件负载联合类型，用于以统一签名保存异构事件处理器。 */
type ChartEventPayload = ChartEventMap[keyof ChartEventMap]
/** 事件处理器统一签名。 */
type ChartEventListener = (payload: ChartEventPayload) => void

export class ChartEventBus {
  private listeners = new Map<keyof ChartEventMap, Set<ChartEventListener>>()

  on<K extends keyof ChartEventMap>(
    event: K,
    handler: (payload: ChartEventMap[K]) => void,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as ChartEventListener)
    return () => {
      this.listeners.get(event)?.delete(handler as ChartEventListener)
    }
  }

  emit<K extends keyof ChartEventMap>(event: K, payload: ChartEventMap[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload))
  }

  clear(): void {
    this.listeners.clear()
  }
}
