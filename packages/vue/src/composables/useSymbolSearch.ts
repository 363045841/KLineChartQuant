import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

export interface SearchableSymbol {
  symbol: string
  description: string
  exchange: string
  source: string
  params?: Readonly<Record<string, string | number | boolean>>
}

export type SymbolIdentity = {
  symbol: string
  exchange?: string
  source?: string
  params?: Readonly<Record<string, string | number | boolean>>
}

export type SymbolSearchFn<T extends SearchableSymbol = SearchableSymbol> = (
  query: string,
  limit: number,
  signal: AbortSignal,
) => Promise<ReadonlyArray<T>>

interface UseSymbolSearchOptions<T extends SearchableSymbol> {
  query: Ref<string>
  symbols: MaybeRefOrGetter<ReadonlyArray<T>>
  search: MaybeRefOrGetter<SymbolSearchFn<T> | undefined>
  limit?: number
  debounceMs?: number
}

function matchesQuery(item: SearchableSymbol, query: string): boolean {
  return (
    item.symbol.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query) ||
    item.exchange.toLowerCase().includes(query)
  )
}

export function symbolIdentityKey(item: SymbolIdentity): string {
  const params = Object.entries(item.params ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return JSON.stringify([item.source ?? '', item.exchange ?? '', item.symbol, params])
}

export function uniqueSymbolsByIdentity<T extends SearchableSymbol>(symbols: ReadonlyArray<T>): T[] {
  const unique = new Map<string, T>()
  for (const item of symbols) {
    const key = symbolIdentityKey(item)
    if (!unique.has(key)) unique.set(key, item)
  }
  return [...unique.values()]
}

export function useSymbolSearch<T extends SearchableSymbol>(options: UseSymbolSearchOptions<T>) {
  const remoteResults = shallowRef<ReadonlyArray<T>>([])
  const loading = ref(false)
  const error = ref(false)
  const limit = options.limit ?? 20
  const debounceMs = options.debounceMs ?? 250
  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let activeController: AbortController | undefined

  const localResults = computed<ReadonlyArray<T>>(() => {
    const query = options.query.value.trim().toLowerCase()
    const symbols = toValue(options.symbols)
    return query ? symbols.filter((item) => matchesQuery(item, query)) : symbols
  })

  const results = computed<ReadonlyArray<T>>(() => {
    if (!options.query.value.trim()) return localResults.value
    const unique = new Map<string, T>()
    for (const item of [...localResults.value, ...remoteResults.value]) {
      const key = symbolIdentityKey(item)
      if (!unique.has(key)) unique.set(key, item)
    }
    return [...unique.values()]
  })

  function scheduleSearch() {
    requestId++
    const currentRequest = requestId
    if (timer !== undefined) clearTimeout(timer)
    activeController?.abort()
    activeController = undefined
    remoteResults.value = []
    loading.value = false
    error.value = false

    const query = options.query.value.trim()
    const search = toValue(options.search)
    if (!query || !search) return

    timer = setTimeout(async () => {
      const controller = new AbortController()
      activeController = controller
      loading.value = true
      try {
        const found = await search(query, limit, controller.signal)
        if (currentRequest !== requestId) return
        remoteResults.value = found
      } catch {
        if (currentRequest !== requestId) return
        error.value = true
        remoteResults.value = []
      } finally {
        if (currentRequest === requestId) {
          activeController = undefined
          loading.value = false
        }
      }
    }, debounceMs)
  }

  watch([options.query, () => toValue(options.search)], scheduleSearch, { immediate: true })

  if (getCurrentScope()) {
    onScopeDispose(() => {
      requestId++
      if (timer !== undefined) clearTimeout(timer)
      activeController?.abort()
    })
  }

  return { results, loading, error }
}
