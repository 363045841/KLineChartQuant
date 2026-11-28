/** 序列视口记忆：唯一的“序列 → 可见区间”仓库。 */
import type { SymbolSpec } from '@/data/symbolSpec.js'
import { seriesViewportKey } from './key.js'
import type { SeriesViewportSnapshot } from '../types.js'

/** 最多保留的序列数；超出后淘汰最早写入的一条。 */
const MAX_SERIES_VIEWS = 200

/** 序列视口记忆的公开契约。 */
export interface SeriesViewportMemory {
  /** 记录指定序列的可见区间；null 不写入。 */
  save(spec: SymbolSpec, snapshot: SeriesViewportSnapshot | null): void
  /** 读取指定序列的可见区间。 */
  get(spec: SymbolSpec): SeriesViewportSnapshot | null
  /** 导出整份视图 map。 */
  exportMap(): Readonly<Record<string, SeriesViewportSnapshot>>
  /** 用布局文档替换整份视图 map。 */
  importMap(map: Readonly<Record<string, SeriesViewportSnapshot>>): void
}

/** 判断任意值是否为合法区间；布局文档来自外部，必须逐条校验。 */
export function readViewportSnapshot(value: unknown): SeriesViewportSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const { fromTime, toTime } = record
  if (
    typeof fromTime !== 'number' ||
    !Number.isFinite(fromTime) ||
    typeof toTime !== 'number' ||
    !Number.isFinite(toTime) ||
    toTime < fromTime
  )
    return null
  return Object.freeze({ fromTime, toTime })
}

/** 创建序列视口记忆；无订阅者，不依赖响应式信号。 */
export function createSeriesViewportMemory(): SeriesViewportMemory {
  const views = new Map<string, SeriesViewportSnapshot>()

  /** 写入并刷新使用顺序；超出上限时淘汰最早的一条。 */
  function remember(key: string, snapshot: SeriesViewportSnapshot): void {
    views.delete(key)
    views.set(key, snapshot)
    while (views.size > MAX_SERIES_VIEWS) {
      const oldest = views.keys().next().value
      if (oldest === undefined) break
      views.delete(oldest)
    }
  }

  return {
    save(spec, snapshot) {
      if (snapshot !== null) remember(seriesViewportKey(spec), snapshot)
    },

    get(spec) {
      return views.get(seriesViewportKey(spec)) ?? null
    },

    exportMap() {
      return Object.freeze(Object.fromEntries(views))
    },

    importMap(map) {
      views.clear()
      for (const [key, value] of Object.entries(map)) {
        const snapshot = readViewportSnapshot(value)
        if (snapshot !== null) remember(key, snapshot)
      }
    },
  }
}
