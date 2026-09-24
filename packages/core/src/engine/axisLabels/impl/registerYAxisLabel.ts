/** Y 轴标签写入的统一入口：优先走帧注入的注册器，未注入时回退到上下文数组。 */

import type { RenderAxisContext, YAxisLabel } from '@/foundation/plugin/types.js'

/**
 * 向当前帧注册一条 Y 轴标签。
 *
 * 帧构建时 `yAxisLabelRegistrar` 由轴标签模块注入，生产者经此注册；
 * 手工构造的上下文（如单测）未注入时回退为直接写入 `yAxisLabels`。
 *
 * @param context - 当前帧渲染上下文
 * @param label - 待注册的 Y 轴标签
 */
export function registerYAxisLabel(context: RenderAxisContext, label: YAxisLabel): void {
  const registrar = context.yAxisLabelRegistrar
  if (registrar) {
    registrar.register(label)
    return
  }
  context.yAxisLabels.push(label)
}
