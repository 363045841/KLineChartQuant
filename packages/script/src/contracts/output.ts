/**
 * 输出契约：脚本产出的 Plot 与事件流
 *
 * 引擎通过 OutputSink 写出结果，不关心结果落到内存还是图表
 */

/** 单个绘图点；value 为 NaN 表示 na（无值），颜色缺省时由渲染端决定 */
export interface PlotPoint {
  value: number
  /** CSS 颜色字符串 */
  color?: string
}

/** 告警事件：由 alert() 直接触发，或 alertcondition() 命中产生 */
export interface AlertEvent {
  kind: 'alert'
  /** 事件时间戳（毫秒，UTC） */
  time: number
  barIndex: number
  message: string
  /** alertcondition 名称；alert() 直接触发时为空 */
  condition?: string
}

/** 日志事件 */
export interface LogEvent {
  kind: 'log'
  /** 事件时间戳（毫秒，UTC） */
  time: number
  barIndex: number
  message: string
}

/** 输出汇聚点：接收 Plot 绘图点与事件 */
export interface OutputSink {
  /** 接收绘图点，用于绘制指标曲线 */
  onPlot(id: string, barIndex: number, point: PlotPoint): void
  /** 接收告警和日志，用于通知或记录 */
  onEvent(e: AlertEvent | LogEvent): void
}
