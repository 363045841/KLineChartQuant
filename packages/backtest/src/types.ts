/**
 * 回测引擎对外契约。
 *
 * 第一版只覆盖 1h L2 + 期权位 A/B 分级的理论结局回测：
 * - 信号与线上判定共用 `impl/ichimoku.ts` + `impl/evaluator.ts`（单一实现）。
 * - 三价规则是简化版（信号收盘入场、止损放云的另一侧、目标 2R/3R），
 *   第二版会换成结构位；详见 `impl/settle.ts` 顶部注释。
 */

/** 一根已收盘 K 线。 */
export interface Candle {
  /** 开盘时刻（毫秒，UTC） */
  readonly openTime: number
  /** 收盘时刻（毫秒，UTC） */
  readonly closeTime: number
  /** 开盘价 */
  readonly open: number
  /** 最高价 */
  readonly high: number
  /** 最低价 */
  readonly low: number
  /** 收盘价 */
  readonly close: number
  /** 成交量 */
  readonly volume: number
}

/** 一目均衡表指标序列，全部按 bar 索引对齐；未就绪的值为 null。 */
export interface IchimokuSeries {
  /** bar 数量 */
  readonly length: number
  /** 收盘价序列 */
  readonly close: readonly number[]
  /** 转换线（9 周期） */
  readonly tenkan: readonly (number | null)[]
  /** 基准线（26 周期） */
  readonly kijun: readonly (number | null)[]
  /** 先行带 A（26 周期前计算、提前 26 根绘制） */
  readonly spanA: readonly (number | null)[]
  /** 先行带 B（52 周期前计算、提前 26 根绘制） */
  readonly spanB: readonly (number | null)[]
  /** Wilder ATR(14) */
  readonly atr: readonly (number | null)[]
  /** Regime 方向：close[i] - close[i-26] */
  readonly regimeDiff: readonly (number | null)[]
}

/** 交易方向。 */
export type Direction = 'long' | 'short'

/** 期权位分级：A = 与关键位重叠，B = 不重叠，null = 该时段没有期权数据。 */
export type SignalGrade = 'A' | 'B' | null

/** 一次 L2 信号事件（含执行所需的价格与分级）。 */
export interface SignalEvent {
  /** 信号 bar 索引 */
  readonly barIndex: number
  /** 信号 bar 收盘时刻（毫秒） */
  readonly time: number
  /** 方向 */
  readonly direction: Direction
  /** 入场价 = 信号 bar 收盘价 */
  readonly entryPrice: number
  /** 止损价：多头云下沿、空头云上沿 */
  readonly stopPrice: number
  /** 云上沿 */
  readonly cloudTop: number
  /** 云下沿 */
  readonly cloudBottom: number
  /** 云厚 = 上沿 - 下沿 */
  readonly cloudThickness: number
  /** as-of 期权关键位；无覆盖为 null */
  readonly optionLevels: readonly number[] | null
  /** A/B 分级 */
  readonly grade: SignalGrade
}

/** 交易结局。 */
export type TradeOutcome = 'hit_target' | 'hit_stop' | 'invalidated' | 'expired'

/** 一笔交易记录。 */
export interface TradeRecord {
  /** 自增编号 */
  readonly id: number
  /** 交易对 */
  readonly symbol: string
  /** 方向 */
  readonly direction: Direction
  /** A/B 分级 */
  readonly grade: SignalGrade
  /** 信号 bar 索引 */
  readonly signalIndex: number
  /** 入场 bar 索引 */
  readonly entryIndex: number
  /** 出场 bar 索引 */
  readonly exitIndex: number
  /** 入场时刻（毫秒） */
  readonly entryTime: number
  /** 出场时刻（毫秒） */
  readonly exitTime: number
  /** 入场价 */
  readonly entryPrice: number
  /** 止损价 */
  readonly stopPrice: number
  /** 第一目标（2R） */
  readonly target1: number
  /** 第二目标（3R） */
  readonly target2: number
  /** 每单位价格风险（|entry - stop|） */
  readonly riskPerUnit: number
  /** 出场价 */
  readonly exitPrice: number
  /** 结局 */
  readonly outcome: TradeOutcome
  /** 未扣成本的 R 盈亏 */
  readonly grossR: number
  /** 本笔交易成本（R 单位，恒为正；入场与出场各按单边名义计一次） */
  readonly costR: number
  /** 以 R 为单位的净盈亏 = grossR - costR */
  readonly rMultiple: number
  /** 持仓 bar 数 */
  readonly barsHeld: number
  /** 最大有利偏移（R） */
  readonly maxFavorableR: number
  /** 最大不利偏移（R） */
  readonly maxAdverseR: number
  /** 是否在出场前触及第二目标 */
  readonly reachedTarget2: boolean
  /**
   * 管理规则结局。
   * 第一版刻意未实现（1R 保本 / 第一目标减半 / 结构追踪留给后续版本），恒为 null。
   */
  readonly managedOutcome: null
}

/** 绩效统计。 */
export interface PerformanceStats {
  /** 交易笔数 */
  readonly trades: number
  /** 期望值：每笔平均净 R（已扣配置成本） */
  readonly expectancyR: number
  /** 未扣成本的期望值：每笔平均 R */
  readonly expectancyGrossR: number
  /** 总 R（净） */
  readonly totalR: number
  /** 总 R（未扣成本） */
  readonly totalGrossR: number
  /** 盈亏比 PF = 总盈利 / 总亏损绝对值；无亏损时为 null */
  readonly profitFactor: number | null
  /** 胜率（rMultiple > 0 的占比）；无交易时为 null */
  readonly winRate: number | null
  /** 最大回撤（R 单位，按累计 R 曲线峰值回落） */
  readonly maxDrawdownR: number
  /** 平均持仓 bar 数 */
  readonly avgBarsHeld: number
  /** 持仓 bar 数中位数 */
  readonly medianBarsHeld: number
  /** 盈利笔数 */
  readonly wins: number
  /** 亏损笔数 */
  readonly losses: number
  /** 打平笔数（|R| <= 1e-9） */
  readonly breakeven: number
  /** 平均盈利 R */
  readonly avgWinR: number | null
  /** 平均亏损 R */
  readonly avgLossR: number | null
}

/** 买入持有基准。 */
export interface BuyHoldBenchmark {
  /** 交易对 */
  readonly symbol: string
  /** 起始价 */
  readonly startPrice: number
  /** 结束价 */
  readonly endPrice: number
  /** 总收益率（小数） */
  readonly totalReturn: number
  /** 年化收益率（小数） */
  readonly cagr: number
  /** 覆盖天数 */
  readonly days: number
  /** 起始/结束时刻 */
  readonly startTime: number
  readonly endTime: number
}

/** 随机入场基准。 */
export interface RandomEntryBenchmark {
  /** 交易对 */
  readonly symbol: string
  /** 采样笔数 */
  readonly samples: number
  /** 方向比例与真实信号一致 */
  readonly longRatio: number
  /** 统计 */
  readonly stats: PerformanceStats
}

/** 信号数交叉验证结果。 */
export interface CrossValidation {
  /** 参考文件路径 */
  readonly reference: string
  /** 每条对照明细 */
  readonly rows: readonly {
    readonly symbol: string
    readonly timeframe: string
    /** 回测引擎算出的 L2 信号数 */
    readonly engineSignals: number
    /** report-v2 记录的信号数 */
    readonly referenceSignals: number | null
    /** 回测引擎算出的每周频率 */
    readonly enginePerWeek: number
    /** report-v2 记录的每周频率 */
    readonly referencePerWeek: number | null
    /** 是否一致 */
    readonly matched: boolean
  }[]
  /** 全部一致 */
  readonly matched: boolean
}

/** 止损来源：云边，或最近一个已确认的结构枢轴。 */
export type StopSource = 'cloud' | 'structure'

/** 信号源：一目均衡表替身，或结构破坏事件。 */
export type SignalSource = 'l2' | 'smc-break'

/** 更高的结构周期；用于多周期偏向确认。 */
export type HtfTimeframe = '4h' | '1d'

/** 回测配置。 */
export interface BacktestConfig {
  /** 交易对 */
  readonly symbols: readonly string[]
  /** K 线周期；4h 用于给同一套判据提供近似独立的第二组样本 */
  readonly timeframe: '1h' | '4h'
  /** 第一目标倍数（R） */
  readonly target1R: number
  /** 第二目标倍数（R，仅记录是否到达） */
  readonly target2R: number
  /** 最长持仓 bar 数 */
  readonly maxBars: number
  /** A 级容差：0.5 × 云厚 */
  readonly cloudToleranceRatio: number
  /**
   * 最小止损距离（占入场价的比例；0 = 不过滤）。
   *
   * 云边止损的距离可以小到 0.05% 价格，固定 bps 成本在 R 口径下会被放大成数倍，
   * 这类交易在任何真实成本下都不可做。该闸门只剔除不可开仓的信号。
   */
  readonly minStopDistanceRatio: number
  /** 止损来源：`cloud` = 云边；`structure` = 最近一个已确认的反向枢轴 */
  readonly stopSource: StopSource
  /** 结构止损的枢轴窗口（两侧各需要的 bar 数），仅 `structure` 口径使用 */
  readonly pivotLookback: number
  /**
   * 是否要求信号方向与结构偏向一致才开仓。
   *
   * 偏向来自最近一次 BOS/CHoCH 的方向；偏向未知（尚无破位）时按不一致处理，
   * 因为「不知道」不等于「同向」。
   */
  readonly requireBiasAgreement: boolean
  /** 参与偏向确认的高周期；null 表示只看 LTF */
  readonly htfTimeframe: HtfTimeframe | null
  /** 高周期上的枢轴窗口 */
  readonly htfLookback: number
  /** 入场信号源 */
  readonly signalSource: SignalSource
  /**
   * 结构破位入场的最小力度（`StructureBreak.marginRatio`，0 = 不过滤）。
   *
   * `marginRatio` = 收盘越界的绝对幅度 ÷ 被突破枢轴到最近反向枢轴的距离；
   * 用它把「任何小破坏都算」的密度压下来，只保留位移明显的破位。
   */
  readonly smcMinMarginRatio: number
  /** 单边交易成本（bps，手续费与滑点合并；0 = 不计成本） */
  readonly costBpsPerSide: number
  /** 随机基准种子 */
  readonly randomSeed: number
  /** 随机基准采样数 */
  readonly randomSamples: number
  /** K 线缓存目录 */
  readonly klinesCacheDir: string
  /** 期权数据根目录 */
  readonly optionRoot: string
  /** 输出目录 */
  readonly outDir: string
}

/** 单个成本档位下的绩效。 */
export interface CostSensitivityPoint {
  /** 假设的单边成本（bps） */
  readonly costBpsPerSide: number
  /** 该档位下的期望值（每笔平均 R） */
  readonly expectancyR: number
  /** 该档位下的总 R */
  readonly totalR: number
  /** 该档位下的盈亏比；无亏损时为 null */
  readonly profitFactor: number | null
  /** 该档位下的胜率；无交易时为 null */
  readonly winRate: number | null
}

/** 成本敏感度：多档位绩效与盈亏平衡成本。 */
export interface CostSensitivity {
  /** 各档位绩效，按成本升序 */
  readonly levels: readonly CostSensitivityPoint[]
  /** 期望值归零时的单边成本（bps）；无正期望时为 null */
  readonly breakevenBpsPerSide: number | null
  /** 每 1 bp 单边成本折算的平均 R（成本系数均值） */
  readonly costRPerBps: number
}

/** 单品种回测结果。 */
export interface SymbolBacktestResult {
  /** 交易对 */
  readonly symbol: string
  /** 覆盖的 bar 数 */
  readonly barCount: number
  /** 数据起止时刻 */
  readonly firstBarTime: number
  readonly lastBarTime: number
  /** L2 信号数（全历史） */
  readonly signalCount: number
  /** 因止损解析失败被剔除的信号数 */
  readonly missedStopSignalCount: number
  /** 因最小止损距离被剔除的信号数 */
  readonly filteredSignalCount: number
  /** 因与结构偏向不一致被剔除的信号数 */
  readonly biasFilteredSignalCount: number
  /** 全历史信号每周频率 */
  readonly signalsPerWeek: number
  /** 全部交易 */
  readonly trades: readonly TradeRecord[]
  /** 全样本统计 */
  readonly stats: PerformanceStats
  /** 按 A/B 分组（仅期权窗口内有分级的交易） */
  readonly byGrade: Readonly<Record<'A' | 'B', PerformanceStats>>
  /** 买入持有基准 */
  readonly buyHold: BuyHoldBenchmark
  /** 随机入场基准 */
  readonly randomEntry: RandomEntryBenchmark
  /** 该品种的成本敏感度 */
  readonly costSensitivity: CostSensitivity
}

/** 回测报告。 */
export interface BacktestReport {
  /** 报告结构版本 */
  readonly schemaVersion: 1
  /** 生成时刻 */
  readonly generatedAt: string
  /** 生效配置（含数据源路径） */
  readonly config: BacktestConfig
  /** 数据覆盖说明 */
  readonly data: {
    readonly klines: Readonly<
      Record<string, { readonly bars: number; readonly first: string; readonly last: string }>
    >
    readonly optionSnapshots: Readonly<
      Record<string, { readonly records: number; readonly first: string; readonly last: string }>
    >
  }
  /** 信号数交叉验证 */
  readonly crossValidation: CrossValidation
  /** 分品种结果 */
  readonly results: readonly SymbolBacktestResult[]
  /** 合并统计（两品种合计） */
  readonly combined: {
    readonly stats: PerformanceStats
    readonly byGrade: Readonly<Record<'A' | 'B', PerformanceStats>>
  }
  /** 合并成本敏感度 */
  readonly costSensitivity: CostSensitivity
  /** 明确的假设与未实现项 */
  readonly caveats: readonly string[]
}
