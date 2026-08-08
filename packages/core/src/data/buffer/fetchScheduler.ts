/** 串行化数据请求的调度器：保证同一时刻至多一个 in-flight 任务，并暴露 loading 信号。 */
import { createSignal, type ReadonlySignal, type WritableSignal } from '../../foundation/reactivity/signal'

export class FetchScheduler {
  private _chain: Promise<void> | null = null
  private _loadingSignal: WritableSignal<boolean>
  private _disposed = false
  private _generation = 0

  constructor() {
    this._loadingSignal = createSignal<boolean>(false)
  }

  get loading(): ReadonlySignal<boolean> {
    return this._loadingSignal
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    if (this._disposed) {
      return Promise.reject(new Error('FetchScheduler disposed'))
    }

    const generation = this._generation
    const execute = async (): Promise<T> => {
      if (generation !== this._generation) {
        throw new Error('FetchScheduler task invalidated')
      }
      this._loadingSignal.set(true)
      try {
        return await task()
      } finally {
        if (generation === this._generation) {
          this._chain = null
          if (!this._disposed) this._loadingSignal.set(false)
        }
      }
    }

    if (this._chain) {
      return new Promise<T>((resolve, reject) => {
        this._chain = this._chain!.then(() => {
          execute().then(resolve, reject)
        })
      })
    }

    const promise = execute()
    this._chain = promise.then(
      () => undefined,
      () => undefined,
    )
    return promise
  }

  reset(): void {
    this._generation++
    this._chain = null
    this._loadingSignal.set(false)
  }

  dispose(): void {
    this._disposed = true
    this._generation++
    this._chain = null
  }
}
