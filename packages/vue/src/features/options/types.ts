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

/** 一次采集的面板视图。 */
export interface OptionPanelView {
  /** 期权标的（BTC / ETH / …） */
  readonly currency: string
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
}

/** 期权序列只读端口；面板与 AI 快捷提示共用同一个来源。 */
export interface OptionPanelSource {
  /**
   * 读取某个标的最近的快照序列。
   *
   * @param currency 期权标的
   * @param signal 取消信号
   * @returns 响应原文解析后的值，由解析层校验结构
   */
  fetchSeries(currency: string, signal?: AbortSignal): Promise<unknown>
}

/** 客户端构造选项。 */
export interface OptionClientOptions {
  /** fetch 实现；测试注入替身 */
  readonly fetch: typeof globalThis.fetch
  /** 服务地址；省略时用内置默认 */
  readonly baseUrl?: string
}
