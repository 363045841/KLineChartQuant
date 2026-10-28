/** 公共 Line API：与 Box/Label 共用坐标、归属和生命周期操作。 */
import type { Color } from './color.js'
import type { ChartPoint, DrawingLineApi, DrawingLineContext, DrawingObjectStore, LineExtend, LineOptions, LineRef, LineXLoc } from './drawing.js'
import { extend, LineStyle, xloc } from './drawing.js'
import { checkedDrawingMember, createOwnedDrawingApi, drawingAnchor, drawingAnchorX, drawingWidth } from './drawingApi.js'
export { DRAWING_FUTURE_BARS } from './drawingApi.js'

/** 绑定仓库和运行上下文，不保留可变对象副本。 */
export function createDrawingLineApi(store: DrawingObjectStore, context: DrawingLineContext): DrawingLineApi {
  const api = createOwnedDrawingApi(store, 'trend-line', context.ownerId, () => context.maxLines)
  /** 修改端点时保留未指定分量及原始坐标单位。 */
  function endpoint(ref: LineRef, index: number, x?: number, y?: number): void {
    const value = api.get(ref)
    if (!value) return
    const anchor = value.anchors[index]!
    const next = drawingAnchor(anchor.id, x === undefined ? drawingAnchorX(anchor) : x, y === undefined ? anchor.price : y, value.xloc!, context.barCount)
    api.update(ref, { anchors: value.anchors.map((item, i) => i === index ? next : item) })
  }
  type Tail = [xloc?: LineXLoc, extend?: LineExtend, color?: Color | (string & {}), style?: LineStyle, width?: number]
  type Args = [number, number, number, number, ...Tail] | [ChartPoint, ChartPoint, ...Tail]
  /** 整体收窄参数元组，使两个公开重载保持类型安全。 */
  function coordinates(args: Args): args is [number, number, number, number, ...Tail] { return typeof args[0] === 'number' }  /** 两种重载使用同一对象构造规则。 */
  function points(
    first: ChartPoint,
    second: ChartPoint,
    mode: LineXLoc = xloc.bar_index,
    extension: LineExtend = extend.none,
    color: Color | (string & {}) = context.defaultColor,
    stroke: LineStyle = LineStyle.style_solid,
    width = 1,
  ): LineRef {
    checkedDrawingMember(extension, Object.values(extend), 'extend')
    checkedDrawingMember(stroke, Object.values(LineStyle), 'style')
    const id = store.nextId()
    return api.insert({
      id,
      kind: 'trend-line',
      paneId: context.paneId,
      ownerId: context.ownerId,
      visible: true,
      params: {},
      xloc: mode,
      extend: extension,
      anchors: [first, second].map((point, index) => drawingAnchor(
        `${id}:${index}`,
        (mode === xloc.bar_index ? point.index : point.time) ?? Number.NaN,
        point.price,
        mode,
        context.barCount,
      )),
      style: { stroke: color, strokeStyle: stroke, strokeWidth: drawingWidth(width) },
    })
  }
  function create(x1: number, y1: number, x2: number, y2: number, ...tail: Tail): LineRef
  function create(first: ChartPoint, second: ChartPoint, ...tail: Tail): LineRef
  function create(options: LineOptions): LineRef
  /** 复制 chart.point 值，后续修改 point 不影响图形；选项对象走同一套构造。 */
  function create(...args: Args | [LineOptions]): LineRef {
    if (args.length === 1) {
      const { x1, y1, x2, y2, ...rest } = args[0]
      return points(
        { index: x1, time: x1, price: y1 },
        { index: x2, time: x2, price: y2 },
        rest.xloc,
        rest.extend,
        rest.color,
        rest.style,
        rest.width,
      )
    }
    if (coordinates(args)) {
      const [x1, y1, x2, y2, ...tail] = args
      if (typeof y1 !== 'number' || typeof x2 !== 'number' || typeof y2 !== 'number') throw new TypeError('line.new 需要四个坐标')
      return points({ index: x1, time: x1, price: y1 }, { index: x2, time: x2, price: y2 }, ...tail)
    }
    const [first, second, ...tail] = args
    return points(first, second, ...tail)
  }
  return Object.freeze({
    ...LineStyle, new: create, get all() { return api.all() },
    set_xy1: (id: LineRef, x: number, y: number) => endpoint(id, 0, x, y),
    set_xy2: (id: LineRef, x: number, y: number) => endpoint(id, 1, x, y),
    set_x1: (id: LineRef, x: number) => endpoint(id, 0, x),
    set_y1: (id: LineRef, y: number) => endpoint(id, 0, undefined, y),
    set_x2: (id: LineRef, x: number) => endpoint(id, 1, x),
    set_y2: (id: LineRef, y: number) => endpoint(id, 1, undefined, y),
    set_color: (id: LineRef, stroke: Color | (string & {})) => api.style(id, { stroke }),
    set_style: (id: LineRef, stroke: LineStyle) => api.style(id, { strokeStyle: checkedDrawingMember(stroke, Object.values(LineStyle), 'style') }),
    set_width: (id: LineRef, width: number) => api.style(id, { strokeWidth: drawingWidth(width) }),
    set_extend: (id: LineRef, extension: LineExtend) => api.update(id, { extend: checkedDrawingMember(extension, Object.values(extend), 'extend') }),
    get_x1: (id: LineRef) => { const value = api.get(id); return value ? drawingAnchorX(value.anchors[0]!) : Number.NaN },
    get_x2: (id: LineRef) => { const value = api.get(id); return value ? drawingAnchorX(value.anchors[1]!) : Number.NaN },
    get_y1: (id: LineRef) => api.get(id)?.anchors[0]?.price ?? Number.NaN,
    get_y2: (id: LineRef) => api.get(id)?.anchors[1]?.price ?? Number.NaN,
    get_color: (id: LineRef) => api.get(id)?.style.stroke ?? null,
    get_style: (id: LineRef) => api.get(id)?.style.strokeStyle ?? null,
    get_width: (id: LineRef) => api.get(id)?.style.strokeWidth ?? Number.NaN,
    get_extend: (id: LineRef) => api.get(id)?.extend ?? null,
    /** 求无限直线上给定索引的价格，不受 extend 影响。 */
    get_price(id: LineRef, x: number): number {
      const value = api.get(id)
      if (!value) return Number.NaN
      if (value.xloc !== xloc.bar_index) throw new TypeError('line.get_price 仅支持 xloc.bar_index')
      const [first, second] = value.anchors
      const a = first!
      const b = second!
      const dx = drawingAnchorX(b) - drawingAnchorX(a)
      return dx === 0 ? Number.NaN : a.price + (b.price - a.price) * (x - drawingAnchorX(a)) / dx
    },
    copy: api.copy, delete: api.delete,
  })
}
