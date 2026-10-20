/** 公共 line API：完整对象写入仓库，原生与 VM 共享此实现。 */
import { extend, LineStyle, xloc } from './drawing.js'
import { createDrawingObjectApi } from './drawingObject.js'
import type { ChartPoint, DrawingLineApi, DrawingLineContext, DrawingObjectStore, DrawingObject, LineExtend, LineRef, LineXLoc, PersistedDrawingAnchor } from './drawing.js'

/**
 * line 的 bar_index 坐标允许指向的未来槽位数，与图表时间轴可合成的未来槽位一致。
 *
 * 定义在这里而不是 drawing.ts：VM 预置源码只拼接 lineApi 与 drawingObject，
 * 常量必须随实现一起进入 VM 作用域。
 */
export const DRAWING_FUTURE_BARS = 500

type PointLineArguments = [ChartPoint, ChartPoint, LineXLoc?, LineExtend?, string?, LineStyle?, number?]
type CoordinateLineArguments = [number, number, number, number, LineXLoc?, LineExtend?, string?, LineStyle?, number?]
/** 对整个参数元组收窄，避免对重载参数使用类型断言。 */
function isCoordinateLineArguments(args: PointLineArguments | CoordinateLineArguments): args is CoordinateLineArguments {
  return typeof args[0] === 'number'
}

/** 按坐标类型构造独立锚点；NaN 保留 ID，但不绘制。 */
function lineAnchor(id: string, x: number, price: number, mode: LineXLoc, barCount: number): PersistedDrawingAnchor {
  if (x === Infinity || x === -Infinity || price === Infinity || price === -Infinity) throw new TypeError('line 坐标不能是 Infinity')
  if (Number.isFinite(x) && !Number.isSafeInteger(x)) throw new TypeError('line X 坐标必须是整数')
  // bar_index 必须落在当前已执行的 K 线范围内；把时间戳误用默认 xloc 时在这里暴露。
  if (mode === xloc.bar_index && Number.isFinite(x) && (x < 0 || x > barCount - 1 + DRAWING_FUTURE_BARS)) {
    throw new RangeError('line 的 bar_index 超出当前已执行的 K 线范围；时间坐标请用 xloc.bar_time')
  }
  return { id, type: 'point', ...(mode === xloc.bar_index ? { logicalIndex: x } : { time: x }), price }
}
/** 非法属性在 API 边界拒绝。 */
function checkedMember<T extends string>(value: T, members: readonly T[], name: string): T {
  if (!members.includes(value)) throw new TypeError(`无效的 line ${name}`)
  return value
}
/** 线宽为正整数逻辑像素。 */
function lineWidth(width: number): number {
  if (!Number.isSafeInteger(width) || width < 1) throw new RangeError('line width 必须是正整数')
  return width
}
/** 读取原始 X，禁止混淆索引和时间。 */
function anchorX(anchor: PersistedDrawingAnchor): number {
  if (anchor.logicalIndex !== undefined) return anchor.logicalIndex
  return typeof anchor.time === 'number' ? anchor.time : Number.NaN
}
/** 建立绑定仓库和归属的 API，不修改仓库返回的快照。 */
export function createDrawingLineApi(store: DrawingObjectStore, context: DrawingLineContext): DrawingLineApi {
  const objects = createDrawingObjectApi(store, context.defaultColor)
  const references = new Map<string, LineRef>()
  /** 相同 ID 始终返回相同引用，使 line.all 中的对象可与创建结果直接比较。 */
  function reference(id: string): LineRef {
    const existing = references.get(id)
    if (existing) return existing
    const ref = Object.freeze({ id })
    references.set(id, ref)
    return ref
  }
  /** 只允许操作同一归属的两点线。 */
  function get(ref: LineRef): DrawingObject | undefined {
    const drawing = objects.get(ref.id)
    return drawing?.kind === 'trend-line' && drawing.ownerId === context.ownerId ? drawing : undefined
  }
  /** 已删除引用的修改不产生对象。 */
  function update(ref: LineRef, patch: Partial<DrawingObject>): void {
    const drawing = get(ref)
    if (drawing) objects.update({ ...drawing, ...patch })
  }
  /** 合并样式后提交完整对象。 */
  function style(ref: LineRef, patch: Partial<DrawingObject['style']>): void {
    const drawing = get(ref)
    if (drawing) update(ref, { style: { ...drawing.style, ...patch } })
  }
  /** 更新端点分量，保留坐标单位。 */
  function endpoint(ref: LineRef, index: number, x?: number, y?: number): void {
    const drawing = get(ref)
    const anchor = drawing?.anchors[index]
    if (!drawing || !anchor) return
    const mode = anchor.logicalIndex === undefined ? xloc.bar_time : xloc.bar_index
    const next = lineAnchor(anchor.id, x === undefined ? anchorX(anchor) : x, y === undefined ? anchor.price : y, mode, context.barCount)
    update(ref, { anchors: drawing.anchors.map((item, i) => i === index ? next : item) })
  }
  /** 新建和复制都计入限额，按创建顺序回收。 */
  function insert(drawing: DrawingObject): LineRef {
    const lines = store.list().filter((item) => item.kind === 'trend-line' && item.ownerId === context.ownerId)
    const evicted = lines.slice(0, Math.max(0, lines.length + 1 - context.maxLines))
    objects.create(drawing, evicted.map((old) => old.id))
    for (const old of evicted) {
      references.delete(old.id)
    }
    return reference(drawing.id)
  }
  /** 两种重载复制输入点，不持有外部点对象。 */
  function create(first: ChartPoint, second: ChartPoint, mode?: LineXLoc, extension?: LineExtend, color?: string, stroke?: LineStyle, width?: number): LineRef
  function create(x1: number, y1: number, x2: number, y2: number, mode?: LineXLoc, extension?: LineExtend, color?: string, stroke?: LineStyle, width?: number): LineRef
  function create(...args: PointLineArguments | CoordinateLineArguments): LineRef {
    if (isCoordinateLineArguments(args)) {
      const [x1, y1, x2, y2, mode, extension, color, stroke, width] = args
      if (typeof y1 !== 'number' || typeof x2 !== 'number' || typeof y2 !== 'number') throw new TypeError('line.new 需要四个坐标')
      return createPoints({ index: x1, time: x1, price: y1 }, { index: x2, time: x2, price: y2 }, mode, extension, color, stroke, width)
    }
    const [first, second, mode, extension, color, stroke, width] = args
    if (typeof first !== 'object' || typeof second !== 'object') throw new TypeError('line.new 需要两个 chart.point')
    return createPoints(first, second, mode, extension, color, stroke, width)
  }
  /** 统一坐标与样式的构造规则。 */
  function createPoints(first: ChartPoint, second: ChartPoint, mode: LineXLoc = xloc.bar_index, extension: LineExtend = extend.none, color = context.defaultColor, stroke: LineStyle = LineStyle.style_solid, width = 1): LineRef {
    checkedMember(mode, Object.values(xloc), 'xloc')
    checkedMember(extension, Object.values(extend), 'extend')
    checkedMember(stroke, Object.values(LineStyle), 'style')
    const id = store.nextId()
    return insert({ id, kind: 'trend-line', paneId: context.paneId, ownerId: context.ownerId,
      visible: true, params: {}, xloc: mode, extend: extension,
      anchors: [first, second].map((point, index) => lineAnchor(`${id}:${index}`, (mode === xloc.bar_index ? point.index : point.time) ?? Number.NaN, point.price, mode, context.barCount)),
      style: { stroke: color, strokeStyle: stroke, strokeWidth: lineWidth(width) } })
  }
  return Object.freeze({
    ...LineStyle, new: create,
    get all() { return Object.freeze(store.list().filter((item) => item.kind === 'trend-line' && item.ownerId === context.ownerId).map(({ id }) => reference(id))) },
    set_xy1: (id: LineRef, x: number, y: number) => endpoint(id, 0, x, y),
    set_xy2: (id: LineRef, x: number, y: number) => endpoint(id, 1, x, y),
    set_x1: (id: LineRef, x: number) => endpoint(id, 0, x),
    set_y1: (id: LineRef, y: number) => endpoint(id, 0, undefined, y),
    set_x2: (id: LineRef, x: number) => endpoint(id, 1, x),
    set_y2: (id: LineRef, y: number) => endpoint(id, 1, undefined, y),
    set_color: (id: LineRef, color: string) => style(id, { stroke: color }),
    set_style: (id: LineRef, value: LineStyle) => style(id, { strokeStyle: checkedMember(value, Object.values(LineStyle), 'style') }),
    set_width: (id: LineRef, value: number) => style(id, { strokeWidth: lineWidth(value) }),
    set_extend: (id: LineRef, value: LineExtend) => update(id, { extend: checkedMember(value, Object.values(extend), 'extend') }),
    get_x1: (id: LineRef) => { const a = get(id)?.anchors[0]; return a ? anchorX(a) : Number.NaN },
    get_x2: (id: LineRef) => { const a = get(id)?.anchors[1]; return a ? anchorX(a) : Number.NaN },
    get_y1: (id: LineRef) => get(id)?.anchors[0]?.price ?? Number.NaN,
    get_y2: (id: LineRef) => get(id)?.anchors[1]?.price ?? Number.NaN,
    get_color: (id: LineRef) => get(id)?.style.stroke ?? null,
    get_style: (id: LineRef) => get(id)?.style.strokeStyle ?? null,
    get_width: (id: LineRef) => get(id)?.style.strokeWidth ?? Number.NaN,
    get_extend: (id: LineRef) => get(id)?.extend ?? null,
    /** 按无限直线求价格，不受 extend 影响；垂直线返回 NaN。 */
    get_price(id: LineRef, x: number): number {
      const drawing = get(id)
      if (!drawing) return Number.NaN
      const [a, b] = drawing.anchors
      if (!a || !b) return Number.NaN
      if (a.logicalIndex === undefined) throw new TypeError('line.get_price 仅支持 xloc.bar_index')
      const dx = anchorX(b) - anchorX(a)
      return dx === 0 ? Number.NaN : a.price + (b.price - a.price) * (x - anchorX(a)) / dx
    },
    copy(id: LineRef): LineRef | null {
      const drawing = get(id)
      if (!drawing) return null
      return insert(objects.clone(drawing))
    },
    delete(id: LineRef | null): void {
      if (id && get(id)) { objects.delete(id.id); references.delete(id.id) }
    },
  })
}
