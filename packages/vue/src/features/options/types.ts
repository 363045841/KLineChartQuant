// 期权关键位面板的数据契约层；请求与解析实现位于 impl/。

/** 一个墙位：行权价与持仓量。 */
export interface OptionWallView {
  /** 行权价（USD） */
  readonly strike: number
  /** 未平仓量（张） */
  readonly openInterest: number
}

/** Gamma 加权墙位：行权价与 OI×Γ 合计。 */
export interface OptionGammaWallView {
  /** 行权价（USD） */
  readonly strike: number
  /** OI×Γ 合计，单位 1/USD */
  readonly gammaWeight: number
}

/** 一套关键位；近月与全链两套视图共用这份结构。 */
export interface OptionLevelSetView {
  /** 净 GEX 过零的现价；没有有效过零时为 null */
  readonly gammaFlipUsd: number | null
  /** Call 墙；该视图没有 call 持仓时为 null */
  readonly callWall: OptionWallView | null
  /** Put 墙；该视图没有 put 持仓时为 null */
  readonly putWall: OptionWallView | null
  /** Gamma 加权 Call 墙（主口径） */
  readonly callGammaWall: OptionGammaWallView | null
  /** Gamma 加权 Put 墙（主口径） */
  readonly putGammaWall: OptionGammaWallView | null
  /** 最大痛点 */
  readonly maxPainUsd: number | null
  /** 净 GEX，单位 USD/1% */
  readonly netGexUsdPerPercent: number | null
  /** Put/Call 未平仓量比 */
  readonly putCallOiRatio: number | null
  /** 总未平仓量（张） */
  readonly totalOpenInterest: number | null
  /** 参与统计的行权价个数 */
  readonly contractCount: number | null
}

/** 近月视图：关键位之外再带波动信息。 */
export interface OptionNearTermView extends OptionLevelSetView {
  /** 到期日（YYYY-MM-DD） */
  readonly expiryIso: string | null
  /** 剩余天数 */
  readonly dteDays: number | null
  /** 平值隐含波动率百分数 */
  readonly atmIvPercent: number | null
  /** 现价减 1σ */
  readonly sigmaLowerUsd: number | null
  /** 现价加 1σ */
  readonly sigmaUpperUsd: number | null
  /** 现价减 2σ */
  readonly sigma2LowerUsd: number | null
  /** 现价加 2σ */
  readonly sigma2UpperUsd: number | null
}

/** 一段窗口内的取值区间与变化。 */
export interface OptionTrendRange {
  /** 窗口内最小值 */
  readonly min: number
  /** 窗口内最大值 */
  readonly max: number
  /** 最新值 */
  readonly latest: number
  /** 最新减最早 */
  readonly change: number
}

/** 波动上下文：用序列历史算出的区间与变化，供面板与 Agent 引用。 */
export interface OptionVolatilityContext {
  /** 参与统计的采样数 */
  readonly samples: number
  /** 窗口跨度（毫秒） */
  readonly windowMs: number
  /** 近月 ATM IV 区间；样本不足两个时为 null */
  readonly atmIv: OptionTrendRange | null
  /** 近月 P/C 持仓比区间；样本不足两个时为 null */
  readonly putCall: OptionTrendRange | null
  /** 最新 IV 在窗口内的分位（0–100） */
  readonly atmIvPercentile: number | null
  /** 相对 24 小时前最近采样的 IV 变化（百分点） */
  readonly atmIvChange24h: number | null
  /** 相对 24 小时前最近采样的 P/C 变化 */
  readonly putCallChange24h: number | null
}

/** 一次采集的面板视图。 */
export interface OptionPanelView {
  /** 期权标的（BTC / ETH / SOL / …） */
  readonly currency: string
  /** 数据场所（Deribit / Binance）；旧行没有该字段时为 null */
  readonly venue: string | null
  /** 采集时刻（毫秒） */
  readonly capturedAt: number
  /** 现货指数 */
  readonly spotIndex: number | null
  /** 近月视图 */
  readonly nearTerm: OptionNearTermView
  /** 全链视图 */
  readonly allChain: OptionLevelSetView
  /** 主图口径的翻转位（近月优先、全链兜底） */
  readonly gammaFlipUsd: number | null
  /** 翻转位来源 */
  readonly gammaFlipSource: string | null
  /** 波动上下文；只有一行采样时为 null */
  readonly trend: OptionVolatilityContext | null
  /** 长窗口波动统计；统计服务不可用时为 null（关键位照常可用） */
  readonly volatility: OptionVolatilityStats | null
}

/** 统计的样本来源层。 */
export type OptionStatsSource = 'daily' | 'hourly' | 'none'

/** 一个窗口内的波动分位统计。 */
export interface OptionWindowStats {
  /** 窗口天数（UTC 日历天） */
  readonly windowDays: number
  /** 窗口内实际样本天数 */
  readonly sampleDays: number
  /** 满窗需要的样本天数 */
  readonly expectedDays: number
  /** 窗口内最新平值 IV */
  readonly ivLatest: number | null
  /** 窗口内最高平值 IV */
  readonly ivHigh: number | null
  /** 窗口内最低平值 IV */
  readonly ivLow: number | null
  /** IV Rank；样本不足或高低相同为 null */
  readonly ivRank: number | null
  /** IV Percentile；样本不足为 null */
  readonly ivPercentile: number | null
}

/** 期限结构上的一个到期点。 */
export interface OptionTermPoint {
  /** 到期日（YYYY-MM-DD） */
  readonly expiryIso: string
  /** 剩余天数 */
  readonly dteDays: number
  /** 该到期的平值 IV */
  readonly atmIvPercent: number
}

/** 一次波动统计。 */
export interface OptionVolatilityStats {
  /** 样本来源层 */
  readonly source: OptionStatsSource
  /** 最新样本是否过期（日行 26 小时、小时行 3 小时） */
  readonly stale: boolean
  /** 最新样本采集时刻；没有样本为 null */
  readonly latestCapturedAt: number | null
  /** 20 日年化已实现波动率；样本不足 21 个收盘为 null */
  readonly rv20: number | null
  /** 方差风险溢价：最新平值 IV − rv20 */
  readonly vrp: number | null
  /** 期限结构；最新样本行没有逐到期 IV 时为 null */
  readonly termStructure: readonly OptionTermPoint[] | null
  /** 25Δ 风险逆转（波动点）；没有 7–90 天到期或缺翼时为 null */
  readonly skew25dVolPoints: number | null
  /** 25Δ 偏斜使用的到期日；不可用时为 null */
  readonly skew25dExpiryIso: string | null
  /** 各窗口统计，顺序与请求一致 */
  readonly windows: readonly OptionWindowStats[]
}

/** 期权序列只读端口；面板与 AI 快捷提示共用同一个来源。 */
export interface OptionPanelSource {
  /**
   * 读取某个标的最近的快照序列。
   *
   * @param currency 期权标的
   * @param signal 取消信号
   * @param limit 最多取几行；省略时只取面板需要的最新行
   * @returns 响应原文解析后的值，由解析层校验结构
   */
  fetchSeries(currency: string, signal?: AbortSignal, limit?: number): Promise<unknown>

  /**
   * 读取某个标的的波动统计。
   *
   * @param currency 期权标的
   * @param windows 窗口天数；省略时取 30/90/365
   * @param signal 取消信号
   * @returns 响应原文解析后的值，由解析层校验结构
   */
  fetchStats(currency: string, windows?: readonly number[], signal?: AbortSignal): Promise<unknown>
}

/** 客户端构造选项。 */
export interface OptionClientOptions {
  /** fetch 实现；测试注入替身 */
  readonly fetch: typeof globalThis.fetch
  /** 服务地址；省略时用内置默认 */
  readonly baseUrl?: string
}
