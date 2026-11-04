/** 自选分组派生：按数据源或品种类型投影成菜单分组，不改写自选状态。 */

import type { InstrumentType } from '@363045841yyt/klinechart-core/market-data'
import type { SearchableSymbol } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import type { WatchlistGrouping } from './useWatchlist.js'

/** 分组结果；label 直接作为菜单分组标题。 */
export interface WatchlistGroup {
  key: string
  label: string
  items: ReadonlyArray<SearchableSymbol>
}

/** 品种类型的展示顺序；unknown 固定排在最后。 */
const INSTRUMENT_TYPE_ORDER: ReadonlyArray<InstrumentType> = [
  'stock',
  'index',
  'fund',
  'etf',
  'future',
  'option',
  'forex',
  'crypto',
  'unknown',
]

/** 品种类型的中文展示名；键集合必须覆盖全部协议取值。 */
const INSTRUMENT_TYPE_LABELS: Readonly<Record<InstrumentType, string>> = {
  stock: '股票',
  index: '指数',
  fund: '基金',
  etf: 'ETF',
  future: '期货',
  option: '期权',
  forex: '外汇',
  crypto: '加密货币',
  unknown: '其他',
}

/** 按首次出现顺序收集分桶结果。 */
function bucketBy<T>(
  items: ReadonlyArray<SearchableSymbol>,
  keyOf: (item: SearchableSymbol) => T,
): Map<T, SearchableSymbol[]> {
  const buckets = new Map<T, SearchableSymbol[]>()
  for (const item of items) {
    const key = keyOf(item)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  return buckets
}

/** 按品种类型分组；组顺序固定，组内保持自选原有顺序。 */
function groupByInstrumentType(
  items: ReadonlyArray<SearchableSymbol>,
): ReadonlyArray<WatchlistGroup> {
  const buckets = bucketBy(items, (item) => item.instrumentType)
  return INSTRUMENT_TYPE_ORDER.flatMap((type) => {
    const bucket = buckets.get(type)
    return bucket ? [{ key: type, label: INSTRUMENT_TYPE_LABELS[type], items: bucket }] : []
  })
}

/**
 * 按数据源分组。
 *
 * @param items - 自选条目
 * @param sourceLabels - 数据源显示名；键顺序即分组顺序，缺失的来源按首次出现顺序补在末尾
 */
function groupBySource(
  items: ReadonlyArray<SearchableSymbol>,
  sourceLabels: ReadonlyMap<string, string>,
): ReadonlyArray<WatchlistGroup> {
  const buckets = bucketBy(items, (item) => item.sourceId)
  const ordered = [...sourceLabels.keys()].filter((sourceId) => buckets.has(sourceId))
  for (const sourceId of buckets.keys()) if (!sourceLabels.has(sourceId)) ordered.push(sourceId)
  return ordered.map((sourceId) => ({
    key: sourceId,
    // 目录里已移除的数据源仍展示用户数据，用来源 ID 作标题。
    label: sourceLabels.get(sourceId) ?? sourceId,
    items: buckets.get(sourceId) ?? [],
  }))
}

/**
 * 投影自选分组。
 *
 * @param items - 自选条目
 * @param grouping - 分组维度
 * @param sourceLabels - 数据源显示名，顺序即分组顺序
 */
export function groupWatchlist(
  items: ReadonlyArray<SearchableSymbol>,
  grouping: WatchlistGrouping,
  sourceLabels: ReadonlyMap<string, string>,
): ReadonlyArray<WatchlistGroup> {
  return grouping === 'instrumentType'
    ? groupByInstrumentType(items)
    : groupBySource(items, sourceLabels)
}

/**
 * 分组的响应式投影。
 *
 * @param items - 自选条目
 * @param grouping - 分组维度
 * @param sourceLabels - 数据源显示名
 */
export function useWatchlistGroups(
  items: MaybeRefOrGetter<ReadonlyArray<SearchableSymbol>>,
  grouping: MaybeRefOrGetter<WatchlistGrouping>,
  sourceLabels: MaybeRefOrGetter<ReadonlyMap<string, string>>,
) {
  return computed(() => groupWatchlist(toValue(items), toValue(grouping), toValue(sourceLabels)))
}
