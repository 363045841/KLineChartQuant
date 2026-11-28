/**
 * 品种搜索入口：图表与工作台的警报面板共用同一套默认数据源回退。
 *
 * 调用方只在显式指定源时传 `sources`；省略时使用宿主给定的启用源，
 * 避免每个组件各自复制 `searchInstruments` 的参数拼装。
 */
import {
  type MarketDataContext,
  searchInstruments,
} from '@363045841yyt/klinechart-core/market-data'
import type { SymbolSearchFn } from './useSymbolSearch.js'

/**
 * 创建绑定到指定行情实例的品种搜索函数。
 *
 * @param context 宿主行情实例
 * @param defaultSources 未显式指定源时的默认搜索范围
 * @returns 符合选择器契约的搜索函数
 */
export function createInstrumentSearch(
  context: MarketDataContext,
  defaultSources: () => ReadonlyArray<string>,
): SymbolSearchFn {
  return async (query, limit, signal, sources) => {
    const result = await searchInstruments(context.registry, {
      keyword: query,
      limit,
      signal,
      sources: sources ?? defaultSources(),
    })
    return result.instruments
  }
}
