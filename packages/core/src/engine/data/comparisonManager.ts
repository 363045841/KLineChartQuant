/** 对比序列运行时投影：订阅 Repository 叶子 Buffer，并向比较视图提供数据和加载状态。 */
import type { KLineData, SymbolSpec } from '../../controllers/types'
import type { KLineBuffer } from '../../data/buffer/dataBufferTypes'
import {
  SeriesRepository,
  seriesSelectionKey,
  type SeriesSelection,
} from '../../data/buffer/seriesRepository'

import { symbolSpecIdentityKey } from './symbolIdentity'

type BarsSelection = Extract<SeriesSelection, { kind: 'bars' }>

/** 比较投影所需的协调器能力，不暴露 Repository 内部拓扑。 */
export interface ComparisonHooks {
  selectionForSpec(spec: SymbolSpec): BarsSelection
  createBuffer(spec: SymbolSpec, selection: BarsSelection): KLineBuffer
  loadBuffer(spec: SymbolSpec, selection: BarsSelection, buffer: KLineBuffer): void
loadRange(
    spec: SymbolSpec,
    selection: BarsSelection,
    buffer: KLineBuffer,
    before: number,
  ): void
  releaseSelection(selection: BarsSelection): void
  scheduleDraw(): void
  getSpecs(): ReadonlyArray<SymbolSpec>
  setLoading(loading: boolean): void
}

type BufferSubscriptions = {
  data: () => void
  loading: () => void
  selection: BarsSelection
  buffer: KLineBuffer
}

/** Comparison Buffer 的 runtime projection，不持有行情数据和业务选择。 */
export class ComparisonManager {
  private readonly subscriptions = new Map<string, BufferSubscriptions>()

  /** 创建只引用统一 Repository 的比较投影。 */
  constructor(
    private readonly repository: SeriesRepository,
    private readonly hooks: ComparisonHooks,
  ) {}

  /** 返回 Kernel 中的比较选择副本。 */
  get specs(): SymbolSpec[] {
    return this.hooks.getSpecs().map((spec) => ({ ...spec }))
  }

  /** 从 Repository 读取当前比较序列数据。 */
  get data(): Map<string, KLineData[]> {
    const result = new Map<string, KLineData[]>()
    for (const spec of this.hooks.getSpecs()) {
      const buffer = this.repository.getBars(this.hooks.selectionForSpec(spec))
      if (buffer) result.set(symbolSpecIdentityKey(spec), [...buffer.getRawData()])
    }
    return result
  }

  /** 按当前比较选择安装或移除订阅，并启动尚未加载的 Buffer。 */
  reconcile(): void {
    const specs = this.hooks.getSpecs()
    const desired = new Map(
      specs.map((spec) => {
        const selection = this.hooks.selectionForSpec(spec)
        return [seriesSelectionKey(selection), { spec, selection }] as const
      }),
    )

    for (const key of this.subscriptions.keys()) {
      if (!desired.has(key)) this.removeSubscriptions(key, true)
    }

    for (const [key, { spec, selection }] of desired) {
      const buffer = this.repository.getOrCreateBars(selection, () =>
        this.hooks.createBuffer(spec, selection),
      )
      const mounted = this.subscriptions.get(key)
      if (mounted?.buffer !== buffer) {
        if (mounted) this.removeSubscriptions(key, false)
        this.mountSubscriptions(key, selection, buffer)
      }
      if (!buffer.currentSpec) this.hooks.loadBuffer(spec, selection, buffer)
    }

    this.recomputeLoading()
  }

  /** 清理全部运行时订阅；Buffer 生命周期仍由 Repository 负责。 */
  clearAll(): void {
    for (const key of [...this.subscriptions.keys()]) this.removeSubscriptions(key, true)
    this.hooks.setLoading(false)
  }

  /** 向已选择的比较序列写入内联数据。 */
  setData(identity: string, data: KLineData[]): boolean {
    const spec = this.hooks
      .getSpecs()
      .find(
        (candidate) =>
          symbolSpecIdentityKey(candidate) === identity || candidate.symbol === identity,
      )
    if (!spec) return false
    const selection = this.hooks.selectionForSpec(spec)
    const buffer = this.repository.getOrCreateBars(selection, () =>
      this.hooks.createBuffer(spec, selection),
    )
    const key = seriesSelectionKey(selection)
    const mounted = this.subscriptions.get(key)
    if (mounted?.buffer !== buffer) {
      if (mounted) this.removeSubscriptions(key, false)
      this.mountSubscriptions(key, selection, buffer)
    }
    buffer.setInlineData(data)
    return true
  }

/** 请求所有当前比较序列覆盖主图可见区左缘；每次只向前拉取一页。 */
  ensureRange(firstVisibleTs: number): void {
    for (const spec of this.hooks.getSpecs()) {
      const selection = this.hooks.selectionForSpec(spec)
      const buffer = this.repository.getBars(selection)
      if (
        buffer &&
        buffer.loadedTimeRange &&
        !buffer.loading.peek() &&
        firstVisibleTs < buffer.loadedTimeRange.earliestTs
      ) {
        this.hooks.loadRange(spec, selection, buffer, buffer.loadedTimeRange.earliestTs)
      }
    }
  }

  /** 订阅单个比较 Buffer 的数据与加载状态。 */
  private mountSubscriptions(key: string, selection: BarsSelection, buffer: KLineBuffer): void {
    const data = buffer.data.subscribe(() => this.hooks.scheduleDraw())
    const loading = buffer.loading.subscribe(() => this.recomputeLoading())
    this.subscriptions.set(key, { data, loading, selection, buffer })
  }

  /** 移除单个比较 Buffer 的运行时订阅。 */
  private removeSubscriptions(key: string, release: boolean): void {
    const subscriptions = this.subscriptions.get(key)
    subscriptions?.data()
    subscriptions?.loading()
    this.subscriptions.delete(key)
    if (release && subscriptions) this.hooks.releaseSelection(subscriptions.selection)
  }

  /** 汇总当前比较选择对应 Buffer 的加载状态。 */
  private recomputeLoading(): void {
    const anyLoading = this.hooks
      .getSpecs()
      .some(
        (spec) =>
          this.repository.getBars(this.hooks.selectionForSpec(spec))?.loading.peek() === true,
      )
    this.hooks.setLoading(anyLoading)
  }
}
