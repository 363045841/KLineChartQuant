/** Pine 风格 Box API；两个对角锚点直接写公共 rectangle 对象。 */
import { Color } from './color.js'
import type { BoxBorderStyle, BoxFactory, BoxRef, ChartPoint, DrawingBoxApi, DrawingObjectContext, DrawingObjectStore, DrawingText, LineExtend, LineXLoc } from './drawing.js'
import { extend, xloc } from './drawing.js'
import { checkedDrawingMember, createOwnedDrawingApi, drawingAnchor, drawingAnchorX, drawingWidth } from './drawingApi.js'

/** 创建绑定归属与限额的矩形 API，不持有第二份对象状态。 */
export function createDrawingBoxApi(store: DrawingObjectStore, context: DrawingObjectContext): DrawingBoxApi {
  const api = createOwnedDrawingApi(store, 'rectangle', context.ownerId, () => context.maxObjects)
  /** 更改单个角的分量，未传入分量保持原值。 */
  function corner(ref: BoxRef, index: number, x?: number, y?: number): void {
    const value = api.get(ref)
    if (!value) return
    const anchor = value.anchors[index]!
    const mode = value.xloc!
    const next = drawingAnchor(anchor.id, x === undefined ? drawingAnchorX(anchor) : x, y === undefined ? anchor.price : y, mode, context.barCount)
    api.update(ref, { anchors: value.anchors.map((item, i) => i === index ? next : item) })
  }
  /** 按创建时的坐标单位复制 chart.point。 */
  function point(ref: BoxRef, index: number, point: ChartPoint): void {
    const value = api.get(ref)
    if (value) corner(ref, index, (value.xloc === xloc.bar_index ? point.index : point.time) ?? Number.NaN, point.price)
  }
  /** 文字样式在创建时完整给定，消费端不补默认值。 */
  function text(ref: BoxRef, patch: Partial<DrawingText>): void {
    const value = api.get(ref)
    if (value?.text) api.update(ref, { text: { ...value.text, ...patch } })
  }
  /** 统一两个创建重载的坐标、颜色和文字默认值。 */
  function createPoints(
    first: ChartPoint,
    second: ChartPoint,
    border: Color | (string & {}) = Color.Blue,
    width = 1,
    stroke: BoxBorderStyle = 'solid',
    extension: LineExtend = extend.none,
    mode: LineXLoc = xloc.bar_index,
    background: Color | (string & {}) = Color.Blue,
    content = '',
    size = 12,
    textColor: Color | (string & {}) = Color.Black,
  ): BoxRef {
    checkedDrawingMember(stroke, ['solid', 'dashed', 'dotted'], 'border_style')
    checkedDrawingMember(extension, Object.values(extend), 'extend')
    const id = store.nextId()
    return api.insert({
      id,
      kind: 'rectangle',
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
      style: {
        stroke: border,
        strokeWidth: drawingWidth(width, 0),
        strokeStyle: stroke,
        fill: background,
        fillOpacity: 1,
      },
      text: {
        value: content,
        color: textColor,
        size: drawingWidth(size),
        align: 'center',
        verticalAlign: 'middle',
      },
    })
  }
  type Tail = [border_color?: Color | (string & {}), border_width?: number, border_style?: BoxBorderStyle, extend?: LineExtend, xloc?: LineXLoc, bgcolor?: Color | (string & {}), text?: string, text_size?: number, text_color?: Color | (string & {})]
  type Args = [number, number, number, number, ...Tail] | [ChartPoint, ChartPoint, ...Tail]
  /** 对整个参数元组收窄，避免用断言绕过重载契约。 */
  function coordinates(args: Args): args is [number, number, number, number, ...Tail] { return typeof args[0] === 'number' }
  function create(left: number, top: number, right: number, bottom: number, ...tail: Tail): BoxRef
  function create(first: ChartPoint, second: ChartPoint, ...tail: Tail): BoxRef
  /** Pine 的位置参数顺序保持不变。 */
  function create(...args: Args): BoxRef {
    if (coordinates(args)) {
      const [left, top, right, bottom, ...tail] = args
      return createPoints({ index: left, time: left, price: top }, { index: right, time: right, price: bottom }, ...tail)
    }
    const [first, second, ...tail] = args
    return createPoints(first, second, ...tail)
  }
  const factory: BoxFactory = create
  return Object.freeze({
    new: factory, get all() { return api.all() },
    set_left: (id: BoxRef, x: number) => corner(id, 0, x),
    set_top: (id: BoxRef, y: number) => corner(id, 0, undefined, y),
    set_right: (id: BoxRef, x: number) => corner(id, 1, x),
    set_bottom: (id: BoxRef, y: number) => corner(id, 1, undefined, y),
    set_lefttop: (id: BoxRef, x: number, y: number) => corner(id, 0, x, y),
    set_rightbottom: (id: BoxRef, x: number, y: number) => corner(id, 1, x, y),
    set_top_left_point: (id: BoxRef, p: ChartPoint) => point(id, 0, p),
    set_bottom_right_point: (id: BoxRef, p: ChartPoint) => point(id, 1, p),
    /** 切换坐标单位时同时替换两个 X，禁止隐式解释旧坐标。 */
    set_xloc(id: BoxRef, left: number, right: number, mode: LineXLoc): void {
      const value = api.get(id)
      if (value) api.update(id, { xloc: mode, anchors: value.anchors.map((a, i) => drawingAnchor(a.id, i === 0 ? left : right, a.price, mode, context.barCount)) })
    },
    set_extend: (id: BoxRef, value: LineExtend) => api.update(id, { extend: checkedDrawingMember(value, Object.values(extend), 'extend') }),
    set_bgcolor: (id: BoxRef, fill: Color | (string & {})) => api.style(id, { fill }),
    set_border_color: (id: BoxRef, stroke: Color | (string & {})) => api.style(id, { stroke }),
    set_border_width: (id: BoxRef, width: number) => api.style(id, { strokeWidth: drawingWidth(width, 0) }),
    set_border_style: (id: BoxRef, stroke: BoxBorderStyle) => api.style(id, { strokeStyle: checkedDrawingMember<BoxBorderStyle>(stroke, ['solid', 'dashed', 'dotted'], 'border_style') }),
    set_text: (id: BoxRef, value: string) => text(id, { value }),
    set_text_color: (id: BoxRef, color: Color | (string & {})) => text(id, { color }),
    set_text_size: (id: BoxRef, size: number) => text(id, { size: drawingWidth(size) }),
    set_text_halign: (id: BoxRef, align: DrawingText['align']) => text(id, { align: checkedDrawingMember<DrawingText['align']>(align, ['left', 'center', 'right'], 'text_halign') }),
    set_text_valign: (id: BoxRef, verticalAlign: DrawingText['verticalAlign']) => text(id, { verticalAlign: checkedDrawingMember<DrawingText['verticalAlign']>(verticalAlign, ['top', 'middle', 'bottom'], 'text_valign') }),
    get_left: (id: BoxRef) => { const value = api.get(id); return value ? drawingAnchorX(value.anchors[0]!) : Number.NaN },
    get_top: (id: BoxRef) => api.get(id)?.anchors[0]?.price ?? Number.NaN,
    get_right: (id: BoxRef) => { const value = api.get(id); return value ? drawingAnchorX(value.anchors[1]!) : Number.NaN },
    get_bottom: (id: BoxRef) => api.get(id)?.anchors[1]?.price ?? Number.NaN,
    copy: api.copy, delete: api.delete,
  })
}
