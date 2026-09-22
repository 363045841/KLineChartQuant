/**
 * 渲染器插件注册的运行时常量
 */

/** 全局 Pane ID（渲染到所有 pane） */
export const GLOBAL_PANE_ID = Symbol('global-pane')

/** 优先级推荐范围 */
export const RENDERER_PRIORITY = {
  LAST_PRICE_LABEL: -25, // 最新价格 label 注册（必须在 SYSTEM_YAXIS 之前）
  SYSTEM_YAXIS: -20, // Y轴（系统级）
  SYSTEM_XAXIS: -20, // X轴（系统级）
  BACKGROUND: 0, // 背景层
  GRID: 10, // 网格线
  /**
   * 指标渲染器（MACD, RSI 等）
   * 所有指标渲染器必须使用此优先级或 ≤30 的值
   */
  INDICATOR: 30,
  MAIN: 50, // 主图（K线）
  /**
   * 指标刻度渲染器（依赖于前方指标写入的共享状态）
   * 必须晚于 INDICATOR 和 MAIN，确保每次绘制时先更新指标状态再绘制刻度。
   */
  INDICATOR_SCALE: 55,
  OVERLAY: 80, // 叠加层（标记点）
  FOREGROUND: 100, // 前景层（价格线）
  SYSTEM_BORDER: 120, // 边框（系统级）
  SYSTEM_CROSSHAIR: 150, // 十字线（系统级）
} as const
