/**
 * 状态命名空间工厂函数
 * 用于生成渲染器间共享状态的键名
 */

/** 创建指标状态键 */
export const createIndicatorStateKey = (type: string, paneId: string) =>
  `indicator:${type}:${paneId}` as const
