/**
 * 图元快照投影：把绘图文档对象收敛成 Agent 可读的结构。
 *
 * 落点用显示行表达（窗格身份来自布局），锚点时间统一格式化为 RFC 3339；
 * 工具返回值与上下文投影共用这一份实现，避免两处各写一份漂移。
 */
import type { DrawingObject } from '@/engine/drawing/index.js'
import { drawingAnchorAxes } from '@/engine/drawing/index.js'
import type { ChartAgentDrawingSnapshot, ChartAgentDrawingView } from '../types.js'

/**
 * 投影单个图元的锚点。
 *
 * 只输出该 kind 真正使用的坐标轴：垂直线没有价格，水平线没有时间，
 * 这样读到的对象可以原样写回。
 *
 * @param drawing 图元对象
 * @param formatAnchorTime 时间戳 → RFC 3339
 * @returns 按轴裁剪过的锚点数组
 */
function projectAnchors(
  drawing: DrawingObject,
  formatAnchorTime: (timestamp: number) => string,
): ReadonlyArray<{ readonly time?: string; readonly price?: number }> {
  const axes = drawingAnchorAxes(drawing.kind)
  return Object.freeze(
    drawing.anchors.map((anchor) =>
      Object.freeze({
        ...(axes.time && typeof anchor.time === 'number' && Number.isFinite(anchor.time)
          ? { time: formatAnchorTime(anchor.time) }
          : {}),
        ...(axes.price ? { price: anchor.price } : {}),
      }),
    ),
  )
}

/**
 * 把图元投影为 Agent 快照。
 *
 * @param drawing 图元对象
 * @param row 图元所在显示行（0 是最上面一行）
 * @param formatAnchorTime 时间戳 → RFC 3339
 * @returns 不含当前周期可见性的文档快照
 */
export function projectDrawingSnapshot(
  drawing: DrawingObject,
  row: number,
  formatAnchorTime: (timestamp: number) => string,
): ChartAgentDrawingSnapshot {
  return Object.freeze({
    id: drawing.id,
    kind: drawing.kind,
    row,
    visible: drawing.visible,
    locked: drawing.locked ?? false,
    zIndex: drawing.zIndex ?? null,
    anchors: projectAnchors(drawing, formatAnchorTime),
    style: Object.freeze({ ...drawing.style }),
    labels: Object.freeze(
      Object.fromEntries(
        Object.entries(drawing.labels ?? {}).flatMap(([target, label]) =>
          label ? [[target, Object.freeze({ ...label })]] : [],
        ),
      ),
    ),
    timeframeVisibility: Object.freeze({ ...(drawing.timeframeVisibility ?? { mode: 'all' }) }),
  })
}

/**
 * 在文档快照上补当前周期的可见性，得到工具返回值。
 *
 * @param snapshot 文档快照
 * @param visibleInCurrentPeriod 当前周期是否显示该图元
 * @returns 冻结的图元视图
 */
export function toDrawingView(
  snapshot: ChartAgentDrawingSnapshot,
  visibleInCurrentPeriod: boolean,
): ChartAgentDrawingView {
  return Object.freeze({ ...snapshot, visibleInCurrentPeriod })
}
