/** 比较叠加数据投影：订阅统一行情服务的序列，向主图提供折线数据。 */
import type { KLineData } from '@/foundation/types/bar.js'
import type { SymbolSpec } from '@/foundation/types/instrument.js'
import { DEFAULT_BAR_PAGE_LIMIT } from '../../data/buffer/impl/marketDataPolicy.js'
import type { BarsSeries } from '../../data/service/index.js'
import { OLDER_DATA_STATUS } from '../../data/provider/types.js'

import { symbolSpecIdentityKey } from './symbolIdentity.js'

/** 比较投影所需能力；不暴露行情服务的内部结构。 */
export interface ComparisonHooks {
  acquire(spec: SymbolSpec): BarsSeries
  scheduleDraw(): void
  getSpecs(): readonly SymbolSpec[]
  setLoading(loading: boolean): void
}

interface Mounted {
  readonly series: BarsSeries
  readonly data: () => void
  readonly loading: () => void
}

/** 比较序列的运行时投影，不持有行情数据本身。 */
export class ComparisonManager {
  private readonly mounted = new Map<string, Mounted>()

  constructor(private readonly hooks: ComparisonHooks) {}

  /** 按比较序列捕获快照身份，避免每帧生成新数组。 */
  getContentInputs(): readonly unknown[] {
    return [...this.mounted.entries()].flatMap(([key, entry]) => [key, entry.series.data.peek()])
  }

  /** 返回当前比较选择副本。 */
  get specs(): SymbolSpec[] {
    return this.hooks.getSpecs().map((spec) => ({ ...spec }))
  }

  /** 从序列读取当前比较数据。 */
  get data(): Map<string, KLineData[]> {
    const result = new Map<string, KLineData[]>()
    for (const spec of this.hooks.getSpecs()) {
      const mounted = this.mounted.get(symbolSpecIdentityKey(spec))
      if (mounted) result.set(symbolSpecIdentityKey(spec), [...mounted.series.getRawData()])
    }
    return result
  }

  /** 按当前选择安装或移除订阅。 */
  reconcile(): void {
    const desired = new Map(
      this.hooks.getSpecs().map((spec) => [symbolSpecIdentityKey(spec), spec] as const),
    )
    for (const key of [...this.mounted.keys()]) {
      if (desired.has(key)) continue
      this.remove(key)
    }
    for (const [key, spec] of desired) {
      if (this.mounted.has(key)) continue
      const series = this.hooks.acquire(spec)
      const data = series.data.subscribe(() => this.hooks.scheduleDraw())
      const loading = series.loading.subscribe(() => this.recomputeLoading())
      this.mounted.set(key, { series, data, loading })
    }
    this.recomputeLoading()
  }

  /** 清理全部订阅与序列。 */
  clearAll(): void {
    for (const key of [...this.mounted.keys()]) this.remove(key)
    this.hooks.setLoading(false)
  }

  /** 请求所有比较序列覆盖主图可见区左缘；每次只向前拉一页。 */
  ensureRange(firstVisibleTs: number): void {
    for (const mounted of this.mounted.values()) {
      const { series } = mounted
      const loaded = series.loadedTimeRange
      if (!loaded || series.loading.peek()) continue
      if (series.olderData === OLDER_DATA_STATUS.EXHAUSTED) continue
      if (firstVisibleTs >= loaded.earliestTs) continue
      void series.loadOlder(DEFAULT_BAR_PAGE_LIMIT).catch(() => {})
    }
  }

  /** 移除一个比较序列。 */
  private remove(key: string): void {
    const mounted = this.mounted.get(key)
    if (!mounted) return
    mounted.data()
    mounted.loading()
    mounted.series.dispose()
    this.mounted.delete(key)
  }

  /** 汇总当前比较序列的加载状态。 */
  private recomputeLoading(): void {
    this.hooks.setLoading(
      [...this.mounted.values()].some((entry) => entry.series.loading.peek()),
    )
  }
}
