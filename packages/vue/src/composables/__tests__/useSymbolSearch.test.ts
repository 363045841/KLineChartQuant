/** 统一品种模型搜索、筛选和稳定身份测试。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

import {
  type SearchableSymbol,
  type SymbolSearchFn,
  symbolIdentityKey,
  uniqueSymbolsByIdentity,
  useSymbolSearch,
} from '../useSymbolSearch'
import { makeSearchableSymbol, TEST_SYMBOLS } from './testSymbols'

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

  // 验证远程品种目录会与本地目录合并，并按稳定 ID 去重。
  it('debounces remote search and merges it with local matches', async () => {
    const symbols = ref(TEST_SYMBOLS)
    const search = vi
      .fn<SymbolSearchFn<SearchableSymbol>>()
      .mockResolvedValue([
        TEST_SYMBOLS[0]!,
        makeSearchableSymbol({ id: 'gotdx:stock:1:600036', symbol: '600036', name: '招商银行' }),
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

    expect(search).toHaveBeenCalledWith('600', 20, expect.any(AbortSignal), undefined)
    expect(state.results.value.map((item) => item.symbol)).toEqual(['600519', '600036'])
    expect(state.loading.value).toBe(false)
  })

  // 验证数据源 Tab 使用 sourceId 同时过滤本地和远程目录。
  it('filters local catalog and remote search by the selected source tab', async () => {
    const query = ref('A')
    const sourceFilter = ref<'all' | string>('tradingview')
    const search = vi.fn<SymbolSearchFn<SearchableSymbol>>().mockResolvedValue([
      makeSearchableSymbol({
        id: 'tradingview:stock:NASDAQ:AMZN',
        sourceId: 'tradingview',
        symbol: 'AMZN',
        name: 'Amazon',
        exchange: 'NASDAQ',
        sessionId: 'US',
      }),
    ])
    const state = useSymbolSearch({
      query,
      symbols: ref(TEST_SYMBOLS),
      search: ref(search),
      sourceFilter,
    })

    expect(state.results.value.map((item) => item.symbol)).toEqual(['AAPL'])

    await vi.advanceTimersByTimeAsync(250)

    expect(search).toHaveBeenCalledWith('A', 20, expect.any(AbortSignal), ['tradingview'])
    expect(state.results.value.map((item) => item.symbol)).toEqual(['AAPL', 'AMZN'])
  })

  // 验证旧搜索响应不会覆盖已经发出的新查询。
  it('ignores an older response that resolves after a newer query', async () => {
    const first = deferred<ReadonlyArray<SearchableSymbol>>()
    const second = deferred<ReadonlyArray<SearchableSymbol>>()
    const signals: AbortSignal[] = []
    const search = vi.fn(
      (
        _query: string,
        _limit: number,
        signal: AbortSignal,
      ): Promise<ReadonlyArray<SearchableSymbol>> => {
        signals.push(signal)
        return signals.length === 1 ? first.promise : second.promise
      },
    )
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
    second.resolve([
      makeSearchableSymbol({
        id: 'test:SECOND',
        sourceId: 'test',
        symbol: 'SECOND',
        name: 'Second',
        assetClass: 'unknown',
        exchange: 'TEST',
      }),
    ])
    await Promise.resolve()
    first.resolve([
      makeSearchableSymbol({
        id: 'test:FIRST',
        sourceId: 'test',
        symbol: 'FIRST',
        name: 'First',
        assetClass: 'unknown',
        exchange: 'TEST',
      }),
    ])
    await Promise.resolve()

    expect(state.results.value.map((item) => item.symbol)).toEqual(['SECOND'])
  })

  // 验证相同代码的不同市场品种由不同稳定 ID 区分。
  it('builds distinct identities for the same code in different markets', () => {
    const main = { ...TEST_SYMBOLS[0]!, id: 'gotdx:stock:1:600519' }
    const extended = { ...TEST_SYMBOLS[0]!, id: 'gotdx:ex:31:600519' }

    expect(symbolIdentityKey(main)).not.toBe(symbolIdentityKey(extended))
  })

  // 验证不同数据源内相同的品种 ID 不会在聚合搜索结果中相互覆盖。
  it('includes the source in a standard instrument identity', () => {
    const first = { ...TEST_SYMBOLS[0]!, id: 'stock:600519', sourceId: 'first' }
    const second = { ...TEST_SYMBOLS[0]!, id: 'stock:600519', sourceId: 'second' }

    expect(symbolIdentityKey(first)).not.toBe(symbolIdentityKey(second))
  })

  // 验证 providerRef 的变化不影响稳定 ID 身份。
  it('uses the stable instrument id as the only identity key', () => {
    const first = { ...TEST_SYMBOLS[0]!, providerRef: { market: 1 } }
    const second = { ...TEST_SYMBOLS[0]!, providerRef: { category: 31 } }

    expect(symbolIdentityKey(first)).toBe(symbolIdentityKey(second))
  })

  // 验证比较候选保留相同代码但不同稳定 ID 的品种。
  it('keeps comparison candidates with the same code but distinct identities', () => {
    const first = { ...TEST_SYMBOLS[0]!, id: 'gotdx:stock:1:600519' }
    const duplicate = { ...TEST_SYMBOLS[0]!, id: 'gotdx:ex:1:600519', exchange: 'CN' }

    expect(uniqueSymbolsByIdentity([first, duplicate])).toEqual([first, duplicate])
  })

  // 验证远程失败时保留本地结果并暴露错误状态。
  it('keeps local results and exposes an error when remote search fails', async () => {
    const query = ref('Apple')
    const search = vi.fn().mockRejectedValue(new Error('offline'))
    const state = useSymbolSearch({ query, symbols: ref(TEST_SYMBOLS), search: ref(search) })

    await vi.advanceTimersByTimeAsync(250)

    expect(state.results.value.map((item) => item.symbol)).toEqual(['AAPL'])
    expect(state.error.value).toBe(true)
    expect(state.loading.value).toBe(false)
  })

  // 验证空查询只显示本地目录且不会发起远程请求。
  it('shows the full local catalog without calling search for an empty query', async () => {
    const query = ref('')
    const search = vi.fn()
    const state = useSymbolSearch({ query, symbols: ref(TEST_SYMBOLS), search: ref(search) })

    await vi.advanceTimersByTimeAsync(250)

    expect(state.results.value).toEqual(TEST_SYMBOLS)
    expect(search).not.toHaveBeenCalled()
  })
})
