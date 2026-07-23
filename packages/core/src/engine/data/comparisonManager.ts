import type { KLineData, SymbolSpec } from '../../controllers/types'
import type { KLineBuffer } from '../../data/dataBufferTypes'

import { symbolSpecIdentityKey } from './symbolIdentity'

const BUF_COMPARISON = 'cmp:'

export function comparisonBufferKey(spec: SymbolSpec): string {
  return `cmp:${symbolSpecIdentityKey(spec)}:${spec.period ?? 'daily'}`
}

function specsEqual(left: SymbolSpec | undefined, right: SymbolSpec): boolean {
  if (!left) return false
  const leftKeys = Object.keys(left) as Array<keyof SymbolSpec>
  const rightKeys = Object.keys(right) as Array<keyof SymbolSpec>
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left[key], right[key]))
  )
}

export interface ComparisonHooks {
  createComparisonBuffer(spec: SymbolSpec): { key: string; buffer: KLineBuffer }
  disposeBuffer(key: string): void
  getKLineBuffer(key: string): KLineBuffer | undefined
  getKLineBufferKeys(): string[]
  scheduleDraw(): void
  getSpecs(): ReadonlyArray<SymbolSpec>
  setLoading(loading: boolean): void
}

type BufferSubscriptions = {
  data: () => void
  loading: () => void
}

/** Comparison buffer 的 runtime projection，不持有业务状态。 */
export class ComparisonManager {
  private readonly subscriptions = new Map<string, BufferSubscriptions>()

  constructor(private readonly hooks: ComparisonHooks) {}

  get specs(): SymbolSpec[] {
    return this.hooks.getSpecs().map((spec) => ({ ...spec }))
  }

  get data(): Map<string, KLineData[]> {
    const result = new Map<string, KLineData[]>()
    for (const spec of this.hooks.getSpecs()) {
      const buffer = this.hooks.getKLineBuffer(comparisonBufferKey(spec))
      if (buffer) result.set(symbolSpecIdentityKey(spec), [...buffer.getRawData()])
    }
    return result
  }

  reconcile(mainEarliest?: number): void {
    const specs = this.hooks.getSpecs()
    const desired = new Map(specs.map((spec) => [comparisonBufferKey(spec), spec]))

    for (const key of this.hooks.getKLineBufferKeys()) {
      if (key.startsWith(BUF_COMPARISON) && !desired.has(key)) this.removeRuntime(key)
    }

    for (const [key, spec] of desired) {
      let buffer = this.hooks.getKLineBuffer(key)
      if (!buffer) {
        buffer = this.hooks.createComparisonBuffer(spec).buffer
        this.mountSubscriptions(key, buffer)
      } else if (!this.subscriptions.has(key)) {
        this.mountSubscriptions(key, buffer)
      }
      if (!specsEqual(buffer.currentSpec ?? undefined, spec)) {
        buffer.setSymbol(spec, mainEarliest)
      }
    }

    this.recomputeLoading()
  }

  clearAll(): void {
    for (const key of this.hooks.getKLineBufferKeys()) {
      if (key.startsWith(BUF_COMPARISON)) this.removeRuntime(key)
    }
    for (const subscriptions of this.subscriptions.values()) {
      subscriptions.data()
      subscriptions.loading()
    }
    this.subscriptions.clear()
    this.hooks.setLoading(false)
  }

  setData(identity: string, data: KLineData[]): boolean {
    const spec = this.hooks
      .getSpecs()
      .find((candidate) => symbolSpecIdentityKey(candidate) === identity || candidate.symbol === identity)
    if (!spec) return false
    let buffer = this.hooks.getKLineBuffer(comparisonBufferKey(spec))
    if (!buffer) {
      this.reconcile()
      buffer = this.hooks.getKLineBuffer(comparisonBufferKey(spec))
    }
    if (!buffer) return false
    buffer.setInlineData(data)
    return true
  }

  ensureRange(firstVisibleTs: number, windowEarliestTs: number): void {
    for (const spec of this.hooks.getSpecs()) {
      this.hooks
        .getKLineBuffer(comparisonBufferKey(spec))
        ?.ensureRange(firstVisibleTs, windowEarliestTs)
    }
  }

  private mountSubscriptions(key: string, buffer: KLineBuffer): void {
    const data = buffer.data.subscribe(() => this.hooks.scheduleDraw())
    const loading = buffer.loading.subscribe(() => this.recomputeLoading())
    this.subscriptions.set(key, { data, loading })
  }

  private removeRuntime(key: string): void {
    const subscriptions = this.subscriptions.get(key)
    subscriptions?.data()
    subscriptions?.loading()
    this.subscriptions.delete(key)
    this.hooks.disposeBuffer(key)
  }

  private recomputeLoading(): void {
    const anyLoading = this.hooks
      .getSpecs()
      .some((spec) => this.hooks.getKLineBuffer(comparisonBufferKey(spec))?.loading.peek() === true)
    this.hooks.setLoading(anyLoading)
  }
}
