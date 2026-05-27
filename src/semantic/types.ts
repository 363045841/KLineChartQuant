/**
 * 语义化图表配置类型定义
 * 用于 Agent JSON 控制图表渲染
 */

// ============ 根配置 ============

/** 语义化图表配置 */
export interface SemanticChartConfig {
  /** 版本号，使用 semver 格式 */
  version: `${number}.${number}.${number}`
  data: DataConfig
  indicators?: IndicatorsConfig
  markers?: MarkersConfig
  chart?: ChartOptions
  theme?: ThemeConfig
}

// ============ 数据配置 ============

/** 数据配置 */
export interface DataConfig {
  source: 'baostock' | 'dongcai'
  /** 股票代码（6位数字，不含前缀） */
  symbol: string
  /** 交易所（可选，默认根据代码自动识别） */
  exchange?: 'SH' | 'SZ' | 'BJ'
  /** 开始日期 YYYY-MM-DD */
  startDate: string
  /** 结束日期 YYYY-MM-DD */
  endDate: string
  period: 'daily' | 'weekly' | 'monthly' | '5min' | '15min' | '30min' | '60min'
  adjust: 'qfq' | 'hfq' | 'none'
}

// ============ 指标配置 ============

/** 指标配置 */
export interface IndicatorsConfig {
  main?: MainIndicatorConfig[]
  sub?: SubIndicatorConfig[]
}

// ============ 主图指标：判别联合类型 ============

/** MA 均线参数 */
export interface MAParams {
  periods: number[] // 1-5个周期，如 [5, 10, 20]
}

/** BOLL 布林带参数 */
export interface BOLLParams {
  period?: number // 默认 20
  multiplier?: number // 默认 2
}

/** EXPMA 指数平滑移动平均线参数 */
export interface EXPMAParams {
  fastPeriod?: number // 默认 12
  slowPeriod?: number // 默认 50
}

/** ENE 轨道线参数 */
export interface ENEParams {
  period?: number // 默认 10
  deviation?: number // 默认 11
}

/** 主图指标配置（判别联合） */
export type MainIndicatorConfig =
  | { type: 'MA'; enabled: boolean; params?: MAParams }
  | { type: 'BOLL'; enabled: boolean; params?: BOLLParams }
  | { type: 'EXPMA'; enabled: boolean; params?: EXPMAParams }
  | { type: 'ENE'; enabled: boolean; params?: ENEParams }

// ============ 副图指标 ============

/** 副图指标参数映射 */
export interface SubIndicatorParams {
  VOLUME?: never
  MACD?: { fast?: number; slow?: number; signal?: number }
  RSI?: { period1?: number; period2?: number; period3?: number }
  CCI?: { period?: number }
  STOCH?: { n?: number; m?: number }
  MOM?: { period?: number }
  WMSR?: { period?: number }
  KST?: { roc1?: number; roc2?: number; roc3?: number; roc4?: number; signal?: number }
  FASTK?: { period?: number }
  ATR?: { period?: number }
  WMA?: { period?: number }
  DEMA?: { period?: number }
  TEMA?: { period?: number }
  HMA?: { period?: number }
}

/** 副图指标类型 */
export type SubIndicatorType = keyof SubIndicatorParams

/** 副图指标配置 */
export type SubIndicatorConfig = {
  [K in SubIndicatorType]: {
    type: K
    enabled: boolean
    params?: SubIndicatorParams[K]
  }
}[SubIndicatorType]

// ============ 标记配置 ============

/** 标记配置 */
export interface MarkersConfig {
  showVolumePriceMarkers?: boolean
  showExtremaMarkers?: boolean
  customMarkers?: CustomMarker[]
  legend?: LegendConfig
}

/** 预设图形形状 */
export type MarkerShapeType =
  | 'arrow_up'
  | 'arrow_down'
  | 'flag'
  | 'circle'
  | 'rectangle'
  | 'diamond'

/** 自定义标记 */
export interface CustomMarker {
  id: string
  /**
   * 日期时间字符串
   * - 日K/周K/月K: "YYYY-MM-DD" (如 "2025-01-15")
   * - 分钟K: "YYYY-MM-DD HH:mm" (如 "2025-01-15 09:30")
   */
  date: string
  shape: MarkerShapeType
  /** 图例分组键（可选，用于区分同形状不同含义的标记） */
  groupKey?: string
  /** 标记位置偏移（相对K线中心） */
  offset?: { x?: number; y?: number }
  /** 样式配置 */
  style?: MarkerStyle
  /** 文本标注 */
  label?: MarkerLabel
  /** 元数据（点击弹窗展示，渲染时必须转义防XSS） */
  metadata?: Record<string, unknown>
}

/** 标记样式 */
export interface MarkerStyle {
  fillColor?: string
  strokeColor?: string
  textColor?: string
  size?: number // 图形大小，默认 12
  lineWidth?: number // 线条粗细
  opacity?: number // 透明度 0-1
}

/** 文本标注 */
export interface MarkerLabel {
  text: string
  position?: 'left' | 'right' | 'top' | 'bottom' | 'inside'
  align?: 'start' | 'center' | 'end'
  fontSize?: number
  offset?: { x?: number; y?: number }
}

/** 图例配置 */
export interface LegendConfig {
  enabled?: boolean
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  /** 点击图例项的行为 */
  onClick?: 'highlight' | 'toggle' | 'none'
}

// ============ 图表选项 ============

/** 图表选项 */
export interface ChartOptions {
  kWidth?: number // 默认 10
  kGap?: number // 默认 2
  autoScrollToRight?: boolean
}

// ============ 主题配置 ============

/** 主题配置 */
export interface ThemeConfig {
  priceUpColor?: string
  priceDownColor?: string
}

// ============ 结果类型 ============

/** 应用结果 */
export interface ApplyResult {
  success: boolean
  errors?: string[]
}

/** 校验结果 */
export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

/** 安全校验结果 */
export interface SecurityResult {
  passed: boolean
  violations?: string[]
}
