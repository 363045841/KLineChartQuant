/**
 * 结构分析（SMC/ICT）的对外契约：结构快照、通道状态、突破评估、量钟、阈值档案。
 *
 * 为什么这五份契约与指标层分开：
 *   - 指标层是「收盘后才完整」的序列计算，盘中重算代价高（每根 bar 都要全量 execute）；
 *     结构层只增量维护尾部几根，且必须在盘中就给出结论。两者生命周期不同。
 *   - 指标输出是数值序列；结构输出是「事实 + 事实何时可知 + 尚未发生的概率」，
 *     混进指标契约会让「可确认」与「已计算」两个概念搅在一起。
 *
 * 三条贯穿全部契约的硬约束：
 *   ① 因果性：每个派生事实都带 `confirmedBarIndex`，表示「到哪根 bar 为止的数据才足以
 *      得出该事实」。禁止用居中窗口（`SMC` 库 #101 的 look-ahead 教训：PF 7.32 → 1.82）。
 *   ② 判据与阈值分离：本文件只描述「看到什么」（判据），不决定「多少算够」（阈值）。
 *      阈值全部落在 `ThresholdProfile`，可被滚动优化引擎按品种替换，但改变不了判据。
 *   ③ 可序列化：全部字段是 number/string/boolean/readonly 数组，不含函数、Date、Map，
 *      因为同一份快照要同时喂给图表、agent 工具与回测。
 *
 * 价格与时间口径：价格统一 number（与 `KLineData` 一致，逐笔成交层的 string 精度不进这一层）；
 * 时间统一 UTC 毫秒。`instrumentId` 直接用品种标识（形如 `binance:spot:BTCUSDT`），
 * 口径见 `docs/design/data/instrument-identity.md`：`id` 首段已是 `sourceId`，禁止再拼一层前缀。
 */

import type { KLinePeriod } from '../../data/provider/types.js'

// ---------------------------------------------------------------------------
// 共用：直线与区间
// ---------------------------------------------------------------------------

/**
 * 一条随时间变化的直线：`value(barIndex) = anchorPrice + slopePerBar * (barIndex - anchorBarIndex)`。
 *
 * 通道的上/下轨必须用直线而非标量表达——通道是倾斜的，只存「当前价位」会让调用方
 * 在任意历史 bar 上无法还原当时的值，回测就退化成看图猜。
 */
export interface PriceLine {
  readonly anchorBarIndex: number
  readonly anchorPrice: number
  readonly slopePerBar: number
}

/**
 * 价格带；`lower <= upper` 恒成立，写入方负责保证顺序。
 *
 * 命名避开 `PriceRange`：`engine/scale/impl/scale_Y/price.ts` 已有一个同名的
 * `{ maxPrice, minPrice }`，两者语义不同（那个是坐标轴的显示区间），同名会让聚合导出冲突。
 */
export interface PriceBand {
  readonly lower: number
  readonly upper: number
}

// ---------------------------------------------------------------------------
// 一、StructureSnapshot — 已确认的结构事实
// ---------------------------------------------------------------------------

/** 枢轴相对级别。swing 是主级别（决定趋势），internal 是次级别（用于早期预警）。 */
export const PIVOT_SCALE = {
  swing: 'swing',
  internal: 'internal',
} as const
export type PivotScale = (typeof PIVOT_SCALE)[keyof typeof PIVOT_SCALE]

/** 摆动点的类型。 */
export const PIVOT_KIND = {
  high: 'high',
  low: 'low',
} as const
export type PivotKind = (typeof PIVOT_KIND)[keyof typeof PIVOT_KIND]

/**
 * 一个已确认的枢轴。
 *
 * `barIndex` 是价格所在的 bar，`confirmedBarIndex` 是「足以判定它是枢轴」的那根 bar 之后。
 * 两者必然满足 `confirmedBarIndex >= barIndex`：确认需要后续数据，而确认之后这个枢轴就不会再变。
 * 任何消费方必须用 `confirmedBarIndex` 判断「当时是否已知」，用 `barIndex` 判断「价格在哪里」。
 */
export interface StructurePivot {
  readonly kind: PivotKind
  readonly scale: PivotScale
  /** 枢轴价格所在 bar 的索引。 */
  readonly barIndex: number
  /** 枢轴价格所在 bar 的时间（UTC 毫秒）。 */
  readonly time: number
  readonly price: number
  /** 确认该枢轴所需的最后一根 bar 索引；此索引之后该枢轴不再变化。 */
  readonly confirmedBarIndex: number
  readonly confirmedTime: number
}

/** 摆动点相对上一个同类枢轴的标签。HH/HL 为多头序列，LH/LL 为空头序列。 */
export const SWING_LABEL = {
  higherHigh: 'HH',
  higherLow: 'HL',
  lowerHigh: 'LH',
  lowerLow: 'LL',
} as const
export type SwingLabel = (typeof SWING_LABEL)[keyof typeof SWING_LABEL]

/** 带标签的摆动点；`delta` 是与参照枢轴的价格差，用于判断序列是否仍在延续。 */
export interface StructureSwing {
  readonly label: SwingLabel
  readonly pivot: StructurePivot
  /** 参照枢轴的时间；首个同类枢轴没有参照点，为 null。 */
  readonly referenceTime: number | null
  /** 与参照枢轴的价格差；无参照点时为 null。 */
  readonly delta: number | null
}

/** 结构破坏的类型。BOS 是顺势延续，CHoCH 是趋势方向改变。 */
export const BREAK_KIND = {
  /** Break of Structure：突破与当前趋势同向的枢轴，趋势延续。 */
  bos: 'bos',
  /** Change of Character：突破与当前趋势反向的枢轴，趋势可能反转。 */
  choch: 'choch',
} as const
export type BreakKind = (typeof BREAK_KIND)[keyof typeof BREAK_KIND]

/** 突破方向；`up` 表示向上穿越某个高点枢轴。 */
export const BREAK_DIRECTION = {
  up: 'up',
  down: 'down',
} as const
export type BreakDirection = (typeof BREAK_DIRECTION)[keyof typeof BREAK_DIRECTION]

/**
 * 一次结构破坏。
 *
 * 与 `SMC` 库的 `bos_choch` 不同，这里的 `barIndex` 是**收盘确认**的那根 bar：
 * 只有收盘价越过枢轴价才算破坏，影线穿越不算。这样 `barIndex` 即可用，不需要未来数据。
 * （库的 #114 问题正是因为事件要等未来摆动点确认，导致实际可知时间比标注晚 11 根。）
 */
export interface StructureBreak {
  readonly kind: BreakKind
  readonly direction: BreakDirection
  readonly scale: PivotScale
  /** 被突破的枢轴。 */
  readonly brokenPivot: StructurePivot
  /** 收盘越过枢轴价的那根 bar。 */
  readonly barIndex: number
  readonly time: number
  /** 该 bar 的收盘价。 */
  readonly close: number
  /** 超出枢轴价的绝对幅度。 */
  readonly margin: number
  /** `margin` 相对被突破枢轴到反向枢轴的距离之比；用于跨周期比较突破力度。 */
  readonly marginRatio: number
  /** 突破时刻即确认时刻；保留字段是为了与枢轴使用同一套因果性表达。 */
  readonly confirmedBarIndex: number
  readonly confirmedTime: number
}

/** 结构区的类型。 */
export const STRUCTURE_ZONE_KIND = {
  /** Fair Value Gap：三根 bar 之间的价格失衡缺口。 */
  fvg: 'fvg',
  /** Order Block：反转前最后一根反向 bar 的价格区间。 */
  orderBlock: 'order-block',
  /** Breaker Block：被破坏并反转角色的 Order Block。 */
  breaker: 'breaker',
  /** 未分类失衡：成交量或 delta 意义上的单边倾斜区。 */
  imbalance: 'imbalance',
} as const
export type StructureZoneKind = (typeof STRUCTURE_ZONE_KIND)[keyof typeof STRUCTURE_ZONE_KIND]

/** 结构区状态；被回补的比例单独用 `mitigationRatio` 表达。 */
export const ZONE_STATE = {
  /** 尚未被回补。 */
  active: 'active',
  /** 部分回补但未失效。 */
  mitigated: 'mitigated',
  /** 完全回补或结构已失效，不再参与判断。 */
  invalidated: 'invalidated',
} as const
export type ZoneState = (typeof ZONE_STATE)[keyof typeof ZONE_STATE]

/** 一个结构区（FVG / Order Block / Breaker / 失衡）。 */
export interface StructureZone {
  readonly kind: StructureZoneKind
  /** `up` 表示该区在看涨方向上提供支撑，`down` 表示看跌方向上提供压力。 */
  readonly direction: BreakDirection
  readonly range: PriceBand
  readonly startBarIndex: number
  readonly startTime: number
  readonly confirmedBarIndex: number
  readonly confirmedTime: number
  readonly state: ZoneState
  /** 被回补的比例，0 表示未回补、1 表示完全回补。 */
  readonly mitigationRatio: number
}

/** 当前结构偏向。 */
export const STRUCTURE_BIAS = {
  bull: 'bull',
  bear: 'bear',
  range: 'range',
  /** 数据不足或结构不明，调用方不得据此下结论。 */
  unknown: 'unknown',
} as const
export type StructureBias = (typeof STRUCTURE_BIAS)[keyof typeof STRUCTURE_BIAS]

/** 偏向的依据，让 agent 能解释「为什么是 bull」。 */
export const BIAS_BASIS = {
  /** 最近一次结构破坏是 CHoCH。 */
  choch: 'choch',
  /** 最近一次结构破坏是 BOS。 */
  bos: 'bos',
  /** 没有可用破坏事件。 */
  none: 'none',
} as const
export type BiasBasis = (typeof BIAS_BASIS)[keyof typeof BIAS_BASIS]

/** 结构偏向及其依据。 */
export interface StructureBiasState {
  readonly direction: StructureBias
  readonly basis: BiasBasis
  /** 该偏向形成的时刻；未知时为 null。 */
  readonly sinceTime: number | null
  /** 形成该偏向的结构破坏；无则 null。 */
  readonly sinceBreak: StructureBreak | null
}

/**
 * 数据充分度。
 *
 * 必须随结论一起上报：样本不足时结构结论不可信，调用方要能一眼看出「不能下结论」，
 * 而不是把「没检测到」误当成「不存在」。
 */
export interface StructureQuality {
  /** 实际参与计算的 bar 数量。 */
  readonly barsUsed: number
  /** 该周期下评估结构所需的最小 bar 数量。 */
  readonly requiredBars: number
  readonly sufficient: boolean
  /** 缺失或降级的项（例如上游无 volume 导致失衡判据不可用）。 */
  readonly limitations: readonly string[]
}

/**
 * 某一时刻的结构快照。
 *
 * 这是「已发生且已确认」的事实集合，不含预测。预测在 `BreachAssessment` 里。
 * `asOf` 之前的全部事实都满足 `confirmedTime <= asOf`，调用方不需要再自行过滤。
 */
export interface StructureSnapshot {
  readonly instrumentId: string
  readonly timeframe: KLinePeriod
  /** 评估时刻（UTC 毫秒），等于最后一根参与计算的 bar 的时间。 */
  readonly asOf: number
  /** 最后一根已收盘 bar 的时间；盘中评估时它落后于 `asOf`。 */
  readonly lastClosedBarTime: number
  /** 已确认到的 bar 索引；小于等于该索引的枢轴不会因后续数据改变。 */
  readonly confirmedUpTo: number
  /** 按时间升序的枢轴，仅含 `confirmedBarIndex <= confirmedUpTo` 的项。 */
  readonly pivots: readonly StructurePivot[]
  /** 按时间升序的带标签摆动点。 */
  readonly swings: readonly StructureSwing[]
  /** 最近一次 BOS；无则 null。 */
  readonly lastBos: StructureBreak | null
  /** 最近一次 CHoCH；无则 null。 */
  readonly lastChoch: StructureBreak | null
  /** 尚未失效的结构区，按时间升序。 */
  readonly zones: readonly StructureZone[]
  readonly bias: StructureBiasState
  readonly quality: StructureQuality
}

// ---------------------------------------------------------------------------
// 二、ChannelState — 通道几何（回答「当前周期的通道在哪里」）
// ---------------------------------------------------------------------------

/** 通道的几何类型。 */
export const CHANNEL_KIND = {
  /** 平行通道：由两段平行趋势线界定。 */
  parallel: 'parallel',
  /** 回归通道：由线性回归加标准差带界定。 */
  regression: 'regression',
  /** 水平通道：上下轨均为水平线。 */
  flat: 'flat',
  /** 非平行通道：上下轨斜率不同，逐渐收敛或发散。 */
  disjoint: 'disjoint',
} as const
export type ChannelKind = (typeof CHANNEL_KIND)[keyof typeof CHANNEL_KIND]

/** 通道来源。agent 必须能区分「人画的」与「自动识别的」，两者可信度不同。 */
export const CHANNEL_ORIGIN = {
  /** 用户在图表上手工绘制。 */
  manual: 'manual',
  /** 系统从枢轴自动识别。 */
  auto: 'auto',
  /** agent 通过绘图工具创建。 */
  agent: 'agent',
} as const
export type ChannelOrigin = (typeof CHANNEL_ORIGIN)[keyof typeof CHANNEL_ORIGIN]

/** 通道质量；用于让 agent 判断「这条通道值不值得拿来当判据」。 */
export interface ChannelQuality {
  /** 线性拟合的 R²；水平通道取 1。 */
  readonly rSquared: number
  /** 通道覆盖的 bar 数量。 */
  readonly barCount: number
  /** 上下轨被触及（含影线）的次数。 */
  readonly touchCount: number
  /** 最近一次触及的时间；无则 null。 */
  readonly lastTouchTime: number | null
  /** 上下轨之外收盘的 bar 数量；大于 0 说明通道已被破坏过。 */
  readonly barsClosedOutside: number
}

/**
 * 一条通道的几何与统计状态。
 *
 * `height` 与 `heightRatio` 是对外判断的唯一尺度来源：判据里凡是要说「突破很深」，
 * 都要用「深度 ÷ 通道高度」，不能再用 ATR。通道高度是这条通道自己的天然尺度，
 * 同类比较不需要跨品种校准。
 */
export interface ChannelState {
  readonly id: string
  readonly kind: ChannelKind
  readonly origin: ChannelOrigin
  readonly upper: PriceLine
  readonly lower: PriceLine
  /** 中线；平行/回归通道取上下轨中位，非平行通道为逐 bar 中位。 */
  readonly mid: PriceLine
  readonly startBarIndex: number
  readonly endBarIndex: number
  /** 通道右端的上下轨价差（价格单位）。 */
  readonly height: number
  /** `height` 相对通道内 bar 平均振幅的倍数；跨品种比较用这个而不是 `height`。 */
  readonly heightRatio: number
  /** 通道内 bar 的平均振幅，即 `heightRatio` 的分母。 */
  readonly averageBarRange: number
  readonly quality: ChannelQuality
}

// ---------------------------------------------------------------------------
// 三、BreachAssessment — 突破评估（判据 + 概率，不含阈值裁决）
// ---------------------------------------------------------------------------

/** 突破发生在哪一侧。 */
export const BREACH_SIDE = {
  /** 向上突破上轨。 */
  upper: 'upper',
  /** 向下突破下轨。 */
  lower: 'lower',
} as const
export type BreachSide = (typeof BREACH_SIDE)[keyof typeof BREACH_SIDE]

/**
 * 六条结构判据的原始值。
 *
 * 本结构只放「看到什么」，不放「算不算够」——阈值在 `ThresholdProfile`。
 * 每项在数据不足时为 null 或 false，调用方必须按「缺证据」处理，不得当作「证据为否的强证据」。
 */
export interface BreachEvidence {
  /** ① 越界深度 ÷ 通道高度。影线与收盘都算，取盘中最大越界。 */
  readonly depthRatio: number | null
  /** ② 是否有 bar 收盘在界线之外。这是单条最强的判据，影线越界不算。 */
  readonly closeBeyond: boolean
  /** ③ 位移倍数：越界那根 bar 的振幅 ÷ 通道内近 N 根振幅中位数。 */
  readonly displacementRatio: number | null
  /** ④ 越界之后是否留下未回补的失衡区。 */
  readonly imbalancePresent: boolean
  /** ⑤ 越界之后是否出现反向结构破坏（BOS/CHoCH）；这是「结构性反转」的结论性判据。 */
  readonly reverseBreak: StructureBreak | null
  /** ⑥ 回抽行为。 */
  readonly retest: BreachRetest | null
}

/** 回抽（retest）的状态。 */
export interface BreachRetest {
  /** 是否已回抽到被突破的界线附近。 */
  readonly occurred: boolean
  /** 回抽终点与界线的距离 ÷ 通道高度。 */
  readonly proximityRatio: number
  /** 回抽之后是否重新收在界线之外；true 表示原突破方向仍有效。 */
  readonly heldBeyond: boolean
  /** 回抽结束的那根 bar 索引；未结束为 null。 */
  readonly barIndex: number | null
}

/**
 * 突破概率。
 *
 * 两个概率必须分开：`closeBeyond` 问「这根收盘会不会收在界线外」，
 * `touchBeyond` 问「盘中会不会碰到界线外」。二者的量级差一个因子 2，
 * 混用会让「假突破」与「真突破」的判据互相污染。
 *
 * 计算方式为闭式解（正态近似），因此在 `remaining → 0` 时自然收敛到 0 或 1，
 * 不需要模拟也不会有抖动。`method` 记录时钟口径，便于回测时切片对比。
 */
export interface BreachProbability {
  /** P(收盘价落在界线之外)，0..1。 */
  readonly closeBeyond: number
  /** P(盘中触及界线之外)，0..1；恒不小于 `closeBeyond`。 */
  readonly touchBeyond: number
  /** 剩余进度，0..1；按量钟口径，不用墙上时间。 */
  readonly remaining: number
  /** 单位进度对应的价格波动标准差。 */
  readonly sigma: number
  /** 时钟口径；`gaussian-volume-clock` 表示用成交量进度，`gaussian-time` 表示退回墙上时间。 */
  readonly method: 'gaussian-volume-clock' | 'gaussian-time'
}

/** 跨品种参考的一致性判定。 */
export const CROSS_INSTRUMENT_AGREEMENT = {
  /** 参考品种给出同向结论，提高信心。 */
  aligned: 'aligned',
  /** 参考品种给出同向但更弱的结论。 */
  partial: 'partial',
  /** 参考品种给出反向结论，降低信心。 */
  conflict: 'conflict',
  /** 参考品种数据不可用，不得据此调整。 */
  unavailable: 'unavailable',
} as const
export type CrossInstrumentAgreement =
  (typeof CROSS_INSTRUMENT_AGREEMENT)[keyof typeof CROSS_INSTRUMENT_AGREEMENT]

/**
 * 跨品种一致性证据。
 *
 * 主品种（如 `binance:spot:BTCUSDT`）给出疑似反转时，去查参考品种（如 `binance:perp:BTCUSDT`）：
 * 一致则提高信心，冲突则降低，不可用则原样返回且必须在 `note` 里说明。
 * TradingView 的 `BTCUSDT.P` 只是展示写法，不进入标识；展示层由 `formatInstrumentLabel`
 * 从 `providerRef.market` 生成。
 */
export interface CrossInstrumentConfirmation {
  readonly referenceInstrumentId: string
  /** 参考品种在同一时刻的结构偏向。 */
  readonly referenceBias: StructureBias
  /** 参考品种最近一次反向结构破坏；无则 null。 */
  readonly referenceBreak: StructureBreak | null
  readonly agreement: CrossInstrumentAgreement
  /** 信心调整量，范围 -1..1；正值表示增强。 */
  readonly adjustment: number
  /** 人类可读的一句话解释，agent 直接引用而不必再自行推断。 */
  readonly note: string
}

/**
 * 突破评估。
 *
 * 这是「正在发生 + 尚未发生」的部分：几何来自 `ChannelState`，事实来自 `StructureSnapshot`，
 * 概率来自 `VolumeClock`。它本身不含阈值判断，因此同一份评估可以被不同 `ThresholdProfile`
 * 裁决出不同结论，而事实层不变。
 */
export interface BreachAssessment {
  readonly instrumentId: string
  readonly timeframe: KLinePeriod
  readonly channelId: string
  readonly side: BreachSide
  readonly asOf: number
  /** 评估时刻的现价。 */
  readonly price: number
  /** 被评估界线的当期价格（按 `PriceLine` 在该 bar 处求值）。 */
  readonly boundaryPrice: number
  /** 现价到界线的带符号距离；越界为正。 */
  readonly distance: number
  /** 归一化距离：`distance / channelHeight`。 */
  readonly distanceRatio: number
  /** 越界持续的 bar 数；未越界为 0。 */
  readonly barsSinceBreach: number
  readonly evidence: BreachEvidence
  readonly probabilities: BreachProbability
  /** 结构判据合成的原始信心，0..1，未叠加跨品种调整。 */
  readonly baseConfidence: number
  /** 跨品种参考；未启用时为 null。 */
  readonly crossInstrument: CrossInstrumentConfirmation | null
  /** 叠加跨品种调整后的信心，0..1。 */
  readonly combinedConfidence: number
}

// ---------------------------------------------------------------------------
// 四、VolumeClock — 量钟（用成交进度代替墙上时间）
// ---------------------------------------------------------------------------

/** 期望成交量的估计来源。 */
export const VOLUME_CLOCK_SOURCE = {
  /** 由历史同周期 bar 的分时段成交量分布估计。 */
  historicalProfile: 'historical-profile',
  /** 由当日已完成的时段外推（样本更少，盘中前期更粗糙）。 */
  sessionProfile: 'session-profile',
  /** 只有当前 bar 的实时成交量，无历史分布；此时 `remaining` 不可信。 */
  liveOnly: 'live-only',
} as const
export type VolumeClockSource = (typeof VOLUME_CLOCK_SOURCE)[keyof typeof VOLUME_CLOCK_SOURCE]

/** 分时段期望成交量的一个槽位；槽位数按周期自适应，对外不暴露粒度假设。 */
export interface VolumeProfileSlot {
  /** 槽位序号，从 0 开始，0 对应 bar 起始时间。 */
  readonly slotIndex: number
  /** 槽位起点的分钟偏移（相对 bar 起点）。 */
  readonly startMinute: number
  /** 该槽位的期望成交量，单位与 `KLineData.volume` 一致。 */
  readonly expectedVolume: number
  /** 参与估计的历史样本数；小于 3 时该槽位不可信。 */
  readonly samples: number
}

/**
 * 当前 bar 的成交进度。
 *
 * 为什么不用墙上时间：同样差 1 分钟收盘，凌晨与美盘开盘前的信息量差一个数量级。
 * 用成交量进度当钟后，`remaining` 表示「还剩多少典型成交量要走完」，
 * `sigmaPerUnitVolume` 表示「每单位典型成交量对应的价格波动」，
 * 波动率因此从量价关系里直接得到，不需要单独估 ATR。
 */
export interface VolumeClock {
  readonly timeframe: KLinePeriod
  /** 被计时的 bar 的起始时间。 */
  readonly barTime: number
  readonly source: VolumeClockSource
  /** 该 bar 的期望总成交量。 */
  readonly expectedVolume: number
  /** 已走完的成交量。 */
  readonly elapsedVolume: number
  /** 已完成比例，`elapsedVolume / expectedVolume`；可大于 1（放量 bar）。 */
  readonly progress: number
  /** 剩余比例，等于 `max(0, 1 - progress)`；这是概率闭式解里的 τ。 */
  readonly remaining: number
  /** 单位进度对应的价格波动标准差；这是闭式解里的 σ。 */
  readonly sigmaPerUnitVolume: number
  /** 估计所用的分时段槽位；`liveOnly` 时为空。 */
  readonly slots: readonly VolumeProfileSlot[]
  /** 该估计是否可信；false 时调用方必须退回墙上时间口径并在结论里声明。 */
  readonly sufficient: boolean
}

// ---------------------------------------------------------------------------
// 五、ThresholdProfile — 阈值档案（判据不变，阈值可变）
// ---------------------------------------------------------------------------

/** 阈值来源；用于区分「默认值」「校准值」「人工覆盖」。 */
export const THRESHOLD_PROVENANCE = {
  /** 出厂默认，未针对品种校准。 */
  default: 'default',
  /** 由滚动优化引擎在样本外验证后写入。 */
  calibrated: 'calibrated',
  /** 人工覆盖；优先级最高但必须记录原因。 */
  override: 'override',
} as const
export type ThresholdProvenance = (typeof THRESHOLD_PROVENANCE)[keyof typeof THRESHOLD_PROVENANCE]

/**
 * 单个品种在单个周期上的阈值档案。
 *
 * 这是唯一允许被自动调整的契约层。判据（`BreachEvidence` 的六项）是结构性的、改得慢；
 * 阈值（这里）是统计性的、可频繁调、按品种调。滚动优化引擎只能改这里的数，
 * 改不了「看什么」——这是比任何正则化都强的结构性保障。
 */
export interface ThresholdProfile {
  /** 适用品种，形如 `binance:spot:BTCUSDT`。 */
  readonly instrumentId: string
  readonly timeframe: KLinePeriod
  /** 档案版本号，递增；用于回测溯源。 */
  readonly version: number
  readonly provenance: ThresholdProvenance
  /** ① 判定「已越界」的最小深度比：`depthRatio >= 该值`。 */
  readonly depthRatio: number
  /** ② 是否要求收盘越界（只算影线不算突破）。 */
  readonly requireCloseBeyond: boolean
  /** ③ 判定「有位移」的最小位移倍数。 */
  readonly displacementMultiple: number
  /** ④ 是否要求留下失衡。 */
  readonly requireImbalance: boolean
  /** ⑤ 是否要求出现反向结构破坏；开启后只有出现才可能判为结构性反转。 */
  readonly requireReverseBreak: boolean
  /** ⑥ 回抽窗口，单位 bar 数；超过该窗口仍无回抽则视为未回抽。 */
  readonly retestWindowBars: number
  /** 收盘确认概率阈值：`closeBeyond >= 该值` 视为「已被市场确认」。 */
  readonly pConfirm: number
  /** 跨品种一致性权重，0..1；0 表示不做跨品种调整。 */
  readonly crossInstrumentWeight: number
  /** 上次校准时间；未校准为 null。 */
  readonly calibratedAt: number | null
  /** 校准所用样本数；未校准为 0。 */
  readonly sampleSize: number
  /** 人工覆盖时的原因；非覆盖档为 null。 */
  readonly overrideReason: string | null
}

// ---------------------------------------------------------------------------
// 裁决结果（阈值作用于评估的产物）
// ---------------------------------------------------------------------------

/** 突破的裁决档位；由 `BreachAssessment` + `ThresholdProfile` 共同决定。 */
export const BREACH_VERDICT = {
  /** 尚未越界，也没有越界迹象。 */
  none: 'none',
  /** 已越界，但尚未满足确认条件。 */
  inProgress: 'in-progress',
  /** 越界后收回，判为假突破。 */
  failed: 'failed',
  /** 越界且已被确认，但尚无结构性反转证据。 */
  confirmed: 'confirmed',
  /** 越界并出现反向结构破坏，判为结构性反转。 */
  structuralReversal: 'structural-reversal',
} as const
export type BreachVerdict = (typeof BREACH_VERDICT)[keyof typeof BREACH_VERDICT]

/**
 * 裁决结果。
 *
 * 与 `BreachAssessment` 分开的理由：同一份事实在不同阈值下会得到不同裁决，
 * 而回测需要同时保留「当时看到的」与「当时判成了什么」，否则阈值调优无法归因。
 */
export interface BreachVerdictResult {
  readonly verdict: BreachVerdict
  /** 触发的判据清单，按判定顺序；用于解释与审计。 */
  readonly matchedCriteria: readonly string[]
  /** 未通过但仍可观察的判据，说明「差在哪」。 */
  readonly missingCriteria: readonly string[]
  /** 生成该裁决的阈值档案版本，便于复现。 */
  readonly thresholdVersion: number
}
