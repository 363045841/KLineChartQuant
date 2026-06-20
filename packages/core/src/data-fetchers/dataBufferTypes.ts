import type { Signal } from '../reactivity/signal'
import type { DataWindow } from './dataBuffer'

export interface DataBufferLike {
  readonly data: Signal<ReadonlyArray<unknown>>
  readonly loading: Signal<boolean>
  readonly loadedWindow: DataWindow | null
  getRawData(): unknown[]
  setInlineData(data: unknown[]): void
  dispose(): void
}