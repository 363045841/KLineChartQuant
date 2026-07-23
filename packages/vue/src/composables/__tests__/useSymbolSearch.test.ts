import { computed, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  symbolIdentityKey,
  uniqueSymbolsByIdentity,
  useSymbolSearch,
  type SearchableSymbol,
  type SymbolSearchFn,
} from '../useSymbolSearch'

const catalog: SearchableSymbol[] = [
  {
    symbol: '600519',
    description: '贵州茅台',
    exchange: 'SH',
    source: 'gotdx',
    params: { market: 1 },
  },
  { symbol: 'AAPL', description: 'Apple Inc.', exchange: 'NASDAQ', source: 'tradingview' },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useSymbolSearch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces remote search and merges it with local matches', async () => {
    const symbols = ref(catalog)
    const search = vi.fn<SymbolSearchFn<SearchableSymbol>>().mockResolvedValue([
      catalog[0],
      {
        symbol: '600036',
        description: '招商银行',
        exchange: 'SH',
        source: 'gotdx',
        params: { market: 1 },
      },
    ])
    const query = ref('')
    const state = useSymbolSearch({
      query,
      symbols: computed(() => symbols.value),
      search: computed(() => search),
    })

    query.value = '600'
    await nextTick()
    expect(state.results.value.map((item) => item.symbol)).toEqual(['600519'])
    expect(search).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)

    expect(search).toHaveBeenCalledWith('600', 20, expect.any(AbortSignal))
    expect(state.results.value.map((item) => item.symbol)).toEqual(['600519', '600036'])
    expect(state.loading.value).toBe(false)
  })

  it('ignores an older response that resolves after a newer query', async () => {
    const first = deferred<ReadonlyArray<SearchableSymbol>>()
    const second = deferred<ReadonlyArray<SearchableSymbol>>()
    const signals: AbortSignal[] = []
    const search = vi.fn((...args: unknown[]) => {
      signals.push(args[2] as AbortSignal)
      return signals.length === 1 ? first.promise : second.promise
    }) as unknown as SymbolSearchFn<SearchableSymbol>
    const query = ref('first')
    const state = useSymbolSearch({
      query,
      symbols: ref<ReadonlyArray<SearchableSymbol>>([]),
      search: ref(search),
    })

    await vi.advanceTimersByTimeAsync(250)
    query.value = 'second'
    await nextTick()
    expect(signals[0]?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(250)
    second.resolve([{ symbol: 'SECOND', description: 'Second', exchange: 'TEST', source: 'test' }])
    await Promise.resolve()
    first.resolve([{ symbol: 'FIRST', description: 'First', exchange: 'TEST', source: 'test' }])
    await Promise.resolve()

    expect(state.results.value.map((item) => item.symbol)).toEqual(['SECOND'])
  })

  it('builds distinct identities for the same code in different markets', () => {
    const main = { ...catalog[0]!, params: { market: 1 } }
    const extended = { ...catalog[0]!, params: { category: 31 } }

    expect(symbolIdentityKey(main)).not.toBe(symbolIdentityKey(extended))
  })

  it('keeps comparison candidates with the same code but distinct identities', () => {
    const first = { ...catalog[0]!, params: { market: 1 } }
    const duplicate = { ...catalog[0]!, exchange: 'CN', params: { category: 1 } }

    expect(uniqueSymbolsByIdentity([first, duplicate])).toEqual([first, duplicate])
  })

  it('keeps local results and exposes an error when remote search fails', async () => {
    const query = ref('Apple')
    const search = vi.fn().mockRejectedValue(new Error('offline'))
    const state = useSymbolSearch({ query, symbols: ref(catalog), search: ref(search) })

    await vi.advanceTimersByTimeAsync(250)

    expect(state.results.value.map((item) => item.symbol)).toEqual(['AAPL'])
    expect(state.error.value).toBe(true)
    expect(state.loading.value).toBe(false)
  })

  it('shows the full local catalog without calling search for an empty query', async () => {
    const query = ref('')
    const search = vi.fn()
    const state = useSymbolSearch({ query, symbols: ref(catalog), search: ref(search) })

    await vi.advanceTimersByTimeAsync(250)

    expect(state.results.value).toEqual(catalog)
    expect(search).not.toHaveBeenCalled()
  })
})
