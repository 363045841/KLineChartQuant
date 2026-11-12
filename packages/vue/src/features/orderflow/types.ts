// 订单流面板在浏览器宿主的对外契约；实现位于 impl/。

/** 面板数据来源：把「取某品种的面板」抽象成一个能力，工具与 UI 共用。 */
export interface OrderflowPanelSource {
  /**
   * 取面板的文本形态。
   *
   * @param symbol 交易对（不带永续展示后缀）
   * @param signal 取消信号
   * @returns 六面板文本
   */
  fetchPanelText(symbol: string, signal?: AbortSignal): Promise<string>

  /**
   * 取面板的机读形态。
   *
   * @param symbol 交易对
   * @param signal 取消信号
   * @returns 面板快照
   */
  fetchPanel(symbol: string, signal?: AbortSignal): Promise<unknown>
}

/** 客户端构造参数。 */
export interface OrderflowClientOptions {
  /** 宿主注入的 fetch（便于测试替换） */
  readonly fetch: typeof globalThis.fetch
  /** 只读服务地址；省略时用默认值 */
  readonly baseUrl?: string
}

// ---------------------------------------------------------------------------
// 面板视图类型
//
// 服务端返回的是 JSON，客户端不能假设形状。这里用显式类型守卫解析，
// 而不是 `as`——服务端字段改名时必须让面板显示「数据格式不符」，不能静默画空值。
// ---------------------------------------------------------------------------

/** 某档深度的统计。 */
export interface BandView {
  readonly band: number
  readonly bidNotional: number
  readonly askNotional: number
  readonly imbalance: number
  readonly complete: boolean
}

/** 价格墙。 */
export interface WallView {
  readonly side: 'bid' | 'ask'
  readonly price: number
  readonly notional: number
  readonly distancePct: number
}

/** 深度快照。 */
export interface DepthView {
  readonly midPrice: number
  readonly bidCoveragePct: number
  readonly askCoveragePct: number
  readonly bands: readonly BandView[]
  readonly nearImbalance: number
  readonly walls: readonly WallView[]
}

/** 成交统计。 */
export interface FlowView {
  readonly windowSeconds: number
  readonly takerBuyRatio: number
  readonly netNotional: number
  /** 实际覆盖的秒数；小于周期只显示覆盖时长，null 表示服务端没给（旧版服务端） */
  readonly coverageSeconds: number | null
  readonly granularity: 'aggregated' | 'self-aggregated' | 'recent-trades'
}

/** 大单档。 */
export interface LargeOrderBucketView {
  readonly minNotional: number
  readonly maxNotional: number | null
  readonly notional: number
  readonly share: number
  readonly takerBuyRatio: number
}

/** 大单分层。 */
export interface LargeOrderView {
  readonly trades: number
  readonly spanMs: number
  readonly takerBuyRatio: number
  readonly buckets: readonly LargeOrderBucketView[]
}

/** 持仓结构。 */
export interface PositioningView {
  readonly venue: string
  readonly openInterestBase: number
  readonly openInterestNotional: number
  readonly accountRatio: number | null
  readonly topPositionRatio: number | null
}

/** 单所快照。 */
export interface VenueView {
  readonly venue: string
  /**
   * 该交易所各类记录里最新的时刻（毫秒）。
   *
   * 用来指认「哪一家停摆了多久」：面板级时间戳只说明快照时刻，
   * 采集器只挂了某一家时它仍然是新的。没有任何带时间的记录时为 null。
   */
  readonly updatedAt: number | null
  readonly depth: DepthView | null
  readonly flows: readonly FlowView[]
  readonly largeOrders: LargeOrderView | null
  readonly positioning: PositioningView | null
  readonly errors: readonly { readonly kind: string; readonly message: string }[]
}

/** 跨所合计。 */
export interface TotalsView {
  readonly openInterestBase: number
  readonly openInterestNotional: number
  readonly netFlow1h: number
  readonly takerBuyRatio1h: number | null
  readonly depthHalfPercent: {
    readonly bidNotional: number
    readonly askNotional: number
    readonly imbalance: number
  }
  readonly accountRatioMean: number | null
  readonly topPositionRatioMean: number | null
}

/** 矛盾。 */
export interface ContradictionView {
  readonly kind: string
  readonly detail: string
}

/** 面板快照。 */
export interface PanelView {
  readonly symbol: string
  readonly timestamp: number
  readonly totals: TotalsView
  readonly venues: readonly VenueView[]
  readonly contradictions: readonly ContradictionView[]
}
