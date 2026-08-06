/** 统一品种模型搜索、筛选和稳定身份测试。 */

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
    id: 'gotdx:stock:1:600519',
    sourceId: 'gotdx',
    symbol: '600519',
    name: '贵州茅台',
    assetClass: 'stock',
    exchange: 'SH',
    sessionId: 'CN',
    providerRef: { market: 1 },
    capabilities: {},
  },
  {
    id: 'tradingview:stock:NASDAQ:AAPL',
    sourceId: 'tradingview',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    assetClass: 'stock',
    exchange: 'NASDAQ',
    sessionId: 'US',
    capabilities: {},
  },
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

  // 验证远程品种目录会与本地目录合并，并按稳定 ID 去重。
  it('debounces remote search and merges it with local matches', async () => {
    const symbols = ref(catalog)
    const search = vi.fn<SymbolSearchFn<SearchableSymbol>>().mockResolvedValue([
      catalog[0]!,
      {
        id: 'gotdx:stock:1:600036',
        sourceId: 'gotdx',
        symbol: '600036',
        name: '招商银行',
        assetClass: 'stock',
        exchange: 'SH',
        sessionId: 'CN',
        providerRef: { market: 1 },
        capabilities: {},
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

    expect(search).toHaveBeenCalledWith('600', 20, expect.any(AbortSignal), undefined)
    expect(state.results.value.map((item) => item.symbol)).toEqual(['600519', '600036'])
    expect(state.loading.value).toBe(false)
  })

  // 验证数据源 Tab 使用 sourceId 同时过滤本地和远程目录。
  it('filters local catalog and remote search by the selected source tab', async () => {
    const query = ref('A')
    const sourceFilter = ref<'all' | string>('tradingview')
    const search = vi.fn<SymbolSearchFn<SearchableSymbol>>().mockResolvedValue([
      {
        id: 'tradingview:stock:NASDAQ:AMZN',
        sourceId: 'tradingview',
        symbol: 'AMZN',
        name: 'Amazon',
        assetClass: 'stock',
        exchange: 'NASDAQ',
        sessionId: 'US',
        capabilities: {},
      },
    ])
    const state = useSymbolSearch({
      query,
      symbols: ref(catalog),
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
    second.resolve([
      {
        id: 'test:SECOND',
        sourceId: 'test',
        symbol: 'SECOND',
        name: 'Second',
        assetClass: 'unknown',
        exchange: 'TEST',
        capabilities: {},
      },
    ])
    await Promise.resolve()
    first.resolve([
      {
        id: 'test:FIRST',
        sourceId: 'test',
        symbol: 'FIRST',
        name: 'First',
        assetClass: 'unknown',
        exchange: 'TEST',
        capabilities: {},
      },
    ])
    await Promise.resolve()

    expect(state.results.value.map((item) => item.symbol)).toEqual(['SECOND'])
  })

  // 验证相同代码的不同市场品种由不同稳定 ID 区分。
  it('builds distinct identities for the same code in different markets', () => {
    const main = { ...catalog[0]!, id: 'gotdx:stock:1:600519' }
    const extended = { ...catalog[0]!, id: 'gotdx:ex:31:600519' }

    expect(symbolIdentityKey(main)).not.toBe(symbolIdentityKey(extended))
  })

  // 验证 providerRef 的变化不影响稳定 ID 身份。
  it('uses the stable instrument id as the only identity key', () => {
    const first = { ...catalog[0]!, providerRef: { market: 1 } }
    const second = { ...catalog[0]!, providerRef: { category: 31 } }

    expect(symbolIdentityKey(first)).toBe(symbolIdentityKey(second))
  })

  // 验证比较候选保留相同代码但不同稳定 ID 的品种。
  it('keeps comparison candidates with the same code but distinct identities', () => {
    const first = { ...catalog[0]!, id: 'gotdx:stock:1:600519' }
    const duplicate = { ...catalog[0]!, id: 'gotdx:ex:1:600519', exchange: 'CN' }

    expect(uniqueSymbolsByIdentity([first, duplicate])).toEqual([first, duplicate])
  })

  // 验证远程失败时保留本地结果并暴露错误状态。
  it('keeps local results and exposes an error when remote search fails', async () => {
    const query = ref('Apple')
    const search = vi.fn().mockRejectedValue(new Error('offline'))
    const state = useSymbolSearch({ query, symbols: ref(catalog), search: ref(search) })

    await vi.advanceTimersByTimeAsync(250)

    expect(state.results.value.map((item) => item.symbol)).toEqual(['AAPL'])
    expect(state.error.value).toBe(true)
    expect(state.loading.value).toBe(false)
  })

  // 验证空查询只显示本地目录且不会发起远程请求。
  it('shows the full local catalog without calling search for an empty query', async () => {
    const query = ref('')
    const search = vi.fn()
    const state = useSymbolSearch({ query, symbols: ref(catalog), search: ref(search) })

    await vi.advanceTimersByTimeAsync(250)

    expect(state.results.value).toEqual(catalog)
    expect(search).not.toHaveBeenCalled()
  })
})
