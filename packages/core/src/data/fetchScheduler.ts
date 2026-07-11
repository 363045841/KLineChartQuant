import { createSignal, type Signal } from '../foundation/reactivity/signal'

export class FetchScheduler {
  private _chain: Promise<void> | null = null
  private _loadingSignal: Signal<boolean>
  private _disposed = false

  constructor() {
    this._loadingSignal = createSignal<boolean>(false)
  }

  get loading(): Signal<boolean> {
    return this._loadingSignal
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    if (this._disposed) {
      return Promise.reject(new Error('FetchScheduler disposed'))
    }

    const execute = async (): Promise<T> => {
      this._loadingSignal.set(true)
      try {
        return await task()
      } finally {
        this._chain = null
        if (!this._disposed) this._loadingSignal.set(false)
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
    this._chain = null
    this._loadingSignal.set(false)
  }

  dispose(): void {
    this._disposed = true
    this._chain = null
  }
}
