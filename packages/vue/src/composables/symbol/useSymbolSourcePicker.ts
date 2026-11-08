/** 商品选择弹层的共享状态：弹层开关、聚合源 Tab 与带默认源范围的搜索。 */

import { useAggregationSourceHealth } from '@vue-src/composables/market/useAggregationSourceHealth.js'
import {
  type AggregationSourceDefinition,
  isMockSourceName,
  supportsAggregationSourceSearch,
} from '@vue-src/composables/market/useAggregationSources.js'
import { useAggregationSourceTab } from '@vue-src/composables/market/useAggregationSourceTab.js'
import { computed, reactive, ref, watch } from 'vue'
import { type SearchableSymbol, type SymbolSearchFn, useSymbolSearch } from './useSymbolSearch.js'

/** 商品选择弹层所需的宿主输入；全部用 getter 读取，跟随 props 变化。 */
interface SymbolSourcePickerOptions<T extends SearchableSymbol> {
  aggregationSources: () => ReadonlyArray<AggregationSourceDefinition>
  enabledSourceNames: () => ReadonlySet<string>
  symbols: () => ReadonlyArray<T>
  search: () => SymbolSearchFn<T> | undefined
}

/**
 * 创建商品选择器的共享会话状态。
 *
 * @param options 宿主提供的源列表、启用集合与搜索能力
 * @returns 弹层状态、源 Tab 与搜索结果
 */
function useSymbolSourcePicker<T extends SearchableSymbol>(options: SymbolSourcePickerOptions<T>) {
  const showPopup = ref(false)
  const searchQuery = ref('')
  const activeSourceTab = useAggregationSourceTab()
  const { onlineNameSet, refresh: refreshSourceHealth } = useAggregationSourceHealth()

  /** 全部 + 已启用、在线且可搜索的源；连接失败的源不展示；mock 沉底。 */
  const sourceTabs = computed<Array<{ id: string; label: string }>>(() => {
    const enabled = options.enabledSourceNames()
    const online = onlineNameSet.value
    const searchable = options
      .aggregationSources()
      .filter(
        (source) =>
          enabled.has(source.name) &&
          online.has(source.name) &&
          supportsAggregationSourceSearch(source),
      )
      .slice()
      .sort((a, b) => Number(isMockSourceName(a.name)) - Number(isMockSourceName(b.name)))
    if (searchable.length === 0) return []
    return [
      { id: 'all', label: '全部' },
      ...searchable.map((source) => ({ id: source.name, label: source.displayName })),
    ]
  })

  /** 未选择具体源时只搜索已启用、在线且可搜索的源，离线源不发必然失败的请求。 */
  const defaultSources = computed(() =>
    sourceTabs.value.filter((tab) => tab.id !== 'all').map((tab) => tab.id),
  )

  const search = useSymbolSearch<T>({
    query: searchQuery,
    symbols: computed(options.symbols),
    search: computed(options.search),
    sourceFilter: activeSourceTab,
    defaultSources,
  })

  // 弹层打开时刷新已启用源的健康状态，离线源不进入 Tab（TTL 内复用上次结果）。
  watch(showPopup, (show) => {
    if (!show) return
    void refreshSourceHealth(options.aggregationSources(), { names: options.enabledSourceNames() })
  })

  // 启用列表变化时，若当前 Tab 已不存在则回到全部。
  watch(sourceTabs, (tabs) => {
    if (!tabs.some((tab) => tab.id === activeSourceTab.value)) activeSourceTab.value = 'all'
  })

  function togglePopup(): void {
    showPopup.value = !showPopup.value
  }

  /** 关闭弹层并清空搜索。 */
  function closePopup(): void {
    showPopup.value = false
    searchQuery.value = ''
  }

  return reactive({
    showPopup,
    searchQuery,
    togglePopup,
    closePopup,
    sourceTabs,
    activeSourceTab,
    ...search,
  })
}

/** 组件 props 中参与选择器会话的字段。 */
export interface SymbolPickerProps<T extends SearchableSymbol> {
  symbols: ReadonlyArray<T>
  search?: SymbolSearchFn<T>
  aggregationSources: ReadonlyArray<AggregationSourceDefinition>
  enabledSourceNames: ReadonlySet<string>
}

/**
 * 直接由组件 props 创建选择器会话，避免每个选择器重复声明 getter 映射。
 *
 * @param props 包含品种、搜索与聚合源字段的响应式 props
 * @returns 弹层、源 Tab 与搜索状态
 */
export function useSymbolSourcePickerFromProps<T extends SearchableSymbol>(
  props: SymbolPickerProps<T>,
) {
  return useSymbolSourcePicker({
    aggregationSources: () => props.aggregationSources,
    enabledSourceNames: () => props.enabledSourceNames,
    symbols: () => props.symbols,
    search: () => props.search,
  })
}
