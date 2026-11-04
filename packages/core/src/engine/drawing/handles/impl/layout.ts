/**
 * 手柄布局：把图元的持久化锚点解析成一组可直接绘制、命中的手柄行。
 *
 * 这里只有算法，没有图元特例：位置由落位声明（impl/placement.ts）给出，
 * 线中点手柄是否存在由线表声明；本文件只负责把两者拼成同一份结果。
 */

import { midpoint, type Point } from '@/foundation/geometry/index.js'
import { isScreenPoint } from '../../geometry/impl/coordinateUtils.js'
import { getLineHandles } from '../../geometry/impl/lines.js'
import type { LineHandle } from '../../geometry/types.js'
import type { PersistedDrawingAnchor } from '../../types.js'
import type {
  AnchorHandle,
  DrawingHandle,
  DrawingHandleLayoutOptions,
  DrawingHandlePort,
  DrawingHandleSource,
  LineMidHandle,
} from '../types.js'
import { placeAnchorHandle } from './placement.js'

/**
 * 解析锚点手柄：每个锚点按落位声明出一个手柄，选中态之外的靠边手柄会被过滤。
 * @param drawing 图元
 * @param port 锚点投影端口
 * @param options 选中态：位置不落在锚点自身的手柄只在选中时出现
 * @returns 按锚点顺序排列的手柄行
 */
export function resolveAnchorHandles<Anchor extends PersistedDrawingAnchor>(
  drawing: DrawingHandleSource<Anchor>,
  port: DrawingHandlePort<Anchor>,
  options: DrawingHandleLayoutOptions,
): AnchorHandle[] {
  const handles: AnchorHandle[] = []
  for (const [anchorIndex, anchor] of drawing.anchors.entries()) {
    const screen = port.projectAnchor(anchor)
    if (!screen) continue
    const placed = placeAnchorHandle(drawing.kind, screen, port.bounds)
    if (!placed) continue
    if (placed.selectionOnly && !options.selected) continue
    handles.push({
      kind: 'anchor',
      anchorIndex,
      point: placed.point,
      // 单轴锚点按它独有的那根轴给 resize 光标；两轴锚点保持默认箭头。
      cursor:
        anchor.type === 'horizontal'
          ? 'ns-resize'
          : anchor.type === 'vertical'
            ? 'ew-resize'
            : 'default',
    })
  }
  return handles
}

/**
 * 解析线中点手柄：线表登记了中点手柄的线各出一行，光标按该线的拖拽轴给出。
 * @param drawing 图元
 * @param port 锚点投影端口
 * @returns 按线表顺序排列的手柄行
 */
export function resolveLineMidHandles<Anchor extends PersistedDrawingAnchor>(
  drawing: DrawingHandleSource<Anchor>,
  port: DrawingHandlePort<Anchor>,
): LineMidHandle[] {
  const handles: LineMidHandle[] = []
  for (const line of getLineHandles(drawing.kind)) {
    const point = resolveLineMidPoint(drawing, line, port)
    // 锚点缺失（导入的残缺图元）时不出手柄，避免把手柄画到错误的线上。
    if (point)
      handles.push({
        kind: 'line-mid',
        lineIndex: line.index,
        point,
        cursor: line.axis === 'price' ? 'ns-resize' : 'ew-resize',
      })
  }
  return handles
}

/**
 * 解析图元的全部手柄：锚点在先，线中点手柄在后，与命中优先级一致。
 * @param drawing 图元
 * @param port 锚点投影端口
 * @param options 选中态：未选中不产生靠边手柄与线中点手柄
 * @returns 手柄行；先锚点后中点
 */
export function resolveDrawingHandles<Anchor extends PersistedDrawingAnchor>(
  drawing: DrawingHandleSource<Anchor>,
  port: DrawingHandlePort<Anchor>,
  options: DrawingHandleLayoutOptions,
): DrawingHandle[] {
  const anchors = resolveAnchorHandles(drawing, port, options)
  if (!options.selected) return anchors
  return [...anchors, ...resolveLineMidHandles(drawing, port)]
}

/**
 * 单条线的中点位置；两端锚点任一不可投影时返回 null。
 * @param drawing 图元
 * @param line 线表登记的手柄线
 * @param port 锚点投影端口
 * @returns 中点屏幕坐标或 null
 */
function resolveLineMidPoint<Anchor extends PersistedDrawingAnchor>(
  drawing: DrawingHandleSource<Anchor>,
  line: LineHandle,
  port: DrawingHandlePort<Anchor>,
): Point | null {
  const from = drawing.anchors[line.from]
  const to = drawing.anchors[line.to]
  if (!from || !to) return null
  const a = port.projectAnchor(from)
  const b = port.projectAnchor(to)
  if (!isScreenPoint(a) || !isScreenPoint(b)) return null
  return midpoint(a, b)
}
