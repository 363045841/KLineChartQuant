/** Pine 风格 Box API；两个对角锚点在创建时补齐为顺时针四角（左上、右上、右下、左下）。 */
import { Color } from './color.js'
import type {
  BoxBorderStyle,
  BoxFactory,
  BoxOptions,
  BoxRef,
  ChartPoint,
  DrawingBoxApi,
  DrawingObjectContext,
  DrawingObjectStore,
  DrawingText,
  LineExtend,
  LineXLoc,
  PersistedDrawingAnchor,
} from './drawing.js'
import { extend, xloc } from './drawing.js'
import {
  checkedDrawingMember,
  createOwnedDrawingApi,
  drawingAnchor,
  drawingAnchorX,
  drawingWidth,
} from './drawingApi.js'

/** 创建绑定归属与限额的矩形 API，不持有第二份对象状态。 */
export function createDrawingBoxApi(
  store: DrawingObjectStore,
  context: DrawingObjectContext,
): DrawingBoxApi {
  const api = createOwnedDrawingApi(store, 'rectangle', context.ownerId, () => context.maxObjects)
  /** 四角下标：0 左上、1 右上、2 右下、3 左下。 */
  const LEFT_CORNERS: readonly number[] = [0, 3]
  const TOP_CORNERS: readonly number[] = [0, 1]
  const RIGHT_CORNERS: readonly number[] = [1, 2]
  const BOTTOM_CORNERS: readonly number[] = [2, 3]
  /** 按角写入分量：未出现在映射中的角保持原值；一次 update 只提交一次写入。 */
  function setCorners(
    ref: BoxRef,
    patches: ReadonlyMap<number, { readonly x?: number; readonly y?: number }>,
  ): void {
    const value = api.get(ref)
    if (!value) return
    const mode = value.xloc!
    api.update(ref, {
      anchors: value.anchors.map((anchor, index) => {
        const patch = patches.get(index)
        if (!patch) return anchor
        return drawingAnchor(
          anchor.id,
          patch.x ?? drawingAnchorX(anchor),
          patch.y ?? anchor.price,
          mode,
          context.barCount,
        )
      }),
    })
  }
  /** 把「左/右/上/下」边界写到对应的两个角上。 */
  function sides(patches: ReadonlyArray<readonly [readonly number[], { x?: number; y?: number }]>) {
    const merged = new Map<number, { x?: number; y?: number }>()
    for (const [indexes, patch] of patches) {
      for (const index of indexes) {
        merged.set(index, { ...merged.get(index), ...patch })
      }
    }
    return merged
  }
  /** 按创建时的坐标单位复制 chart.point；index 为四角下标。 */
  function point(ref: BoxRef, index: number, value: ChartPoint): void {
    const box = api.get(ref)
    if (!box) return
    const x = (box.xloc === xloc.bar_index ? value.index : value.time) ?? Number.NaN
    // Pine 的点设置是边界设置：左右上下同步落到相邻角，矩形始终轴对齐。
    setCorners(
      ref,
      index === 0
        ? sides([
            [LEFT_CORNERS, { x }],
            [TOP_CORNERS, { y: value.price }],
          ])
        : sides([
            [RIGHT_CORNERS, { x }],
            [BOTTOM_CORNERS, { y: value.price }],
          ]),
    )
  }
  /** 文字样式在创建时完整给定，消费端不补默认值。 */
  function text(ref: BoxRef, patch: Partial<DrawingText>): void {
    const value = api.get(ref)
    if (value?.text) api.update(ref, { text: { ...value.text, ...patch } })
  }
  /** 由左上、右下两个对角点构造顺时针四角锚点。 */
  function corners(
    id: string,
    left: number,
    right: number,
    top: number,
    bottom: number,
    mode: LineXLoc,
  ): PersistedDrawingAnchor[] {
    // 时间 / 索引与价格分别取两对角分量，顺序固定为左上、右上、右下、左下。
    return [
      drawingAnchor(`${id}:0`, left, top, mode, context.barCount),
      drawingAnchor(`${id}:1`, right, top, mode, context.barCount),
      drawingAnchor(`${id}:2`, right, bottom, mode, context.barCount),
      drawingAnchor(`${id}:3`, left, bottom, mode, context.barCount),
    ]
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
    textColor?: Color | (string & {}),
  ): BoxRef {
    checkedDrawingMember(stroke, ['solid', 'dashed', 'dotted'], 'border_style')
    checkedDrawingMember(extension, Object.values(extend), 'extend')
    const id = store.nextId()
    const firstX = (mode === xloc.bar_index ? first.index : first.time) ?? Number.NaN
    const secondX = (mode === xloc.bar_index ? second.index : second.time) ?? Number.NaN
    return api.insert({
      id,
      kind: 'rectangle',
      paneId: context.paneId,
      ownerId: context.ownerId,
      visible: true,
      params: {},
      xloc: mode,
      extend: extension,
      anchors: corners(
        id,
        Math.min(firstX, secondX),
        Math.max(firstX, secondX),
        Math.max(first.price, second.price),
        Math.min(first.price, second.price),
        mode,
      ),
      style: {
        stroke: border,
        strokeWidth: drawingWidth(width, 0),
        strokeStyle: stroke,
        fill: background,
        fillOpacity: 1,
        // 未指定文字颜色时跟随描边，由渲染端的 textColor ?? stroke 处理。
        ...(textColor === undefined ? {} : { textColor }),
        fontSize: drawingWidth(size),
      },
      text: {
        value: content,
        align: 'center',
        verticalAlign: 'middle',
      },
    })
  }
  type Tail = [
    border_color?: Color | (string & {}),
    border_width?: number,
    border_style?: BoxBorderStyle,
    extend?: LineExtend,
    xloc?: LineXLoc,
    bgcolor?: Color | (string & {}),
    text?: string,
    text_size?: number,
    text_color?: Color | (string & {}),
  ]
  type Args = [number, number, number, number, ...Tail] | [ChartPoint, ChartPoint, ...Tail]
  /** 对整个参数元组收窄，避免用断言绕过重载契约。 */
  function coordinates(args: Args): args is [number, number, number, number, ...Tail] {
    return typeof args[0] === 'number'
  }
  /** 选项对象与位置参数汇入同一构造；未写字段交给 createPoints 的默认值。 */
  function fromOptions(options: BoxOptions): BoxRef {
    const { left, top, right, bottom, ...rest } = options
    return createPoints(
      { index: left, time: left, price: top },
      { index: right, time: right, price: bottom },
      rest.borderColor,
      rest.borderWidth,
      rest.borderStyle,
      rest.extend,
      rest.xloc,
      rest.backgroundColor,
      rest.text,
      rest.textSize,
      rest.textColor,
    )
  }
  function create(left: number, top: number, right: number, bottom: number, ...tail: Tail): BoxRef
  function create(first: ChartPoint, second: ChartPoint, ...tail: Tail): BoxRef
  function create(options: BoxOptions): BoxRef
  /** Pine 的位置参数顺序保持不变，选项对象形态走同一套构造。 */
  function create(...args: Args | [BoxOptions]): BoxRef {
    if (args.length === 1) return fromOptions(args[0])
    if (coordinates(args)) {
      const [left, top, right, bottom, ...tail] = args
      return createPoints(
        { index: left, time: left, price: top },
        { index: right, time: right, price: bottom },
        ...tail,
      )
    }
    const [first, second, ...tail] = args
    return createPoints(first, second, ...tail)
  }
  const factory: BoxFactory = create
  return Object.freeze({
    new: factory,
    get all() {
      return api.all()
    },
    set_left: (id: BoxRef, x: number) => setCorners(id, sides([[LEFT_CORNERS, { x }]])),
    set_top: (id: BoxRef, y: number) => setCorners(id, sides([[TOP_CORNERS, { y }]])),
    set_right: (id: BoxRef, x: number) => setCorners(id, sides([[RIGHT_CORNERS, { x }]])),
    set_bottom: (id: BoxRef, y: number) => setCorners(id, sides([[BOTTOM_CORNERS, { y }]])),
    set_lefttop: (id: BoxRef, x: number, y: number) =>
      setCorners(
        id,
        sides([
          [LEFT_CORNERS, { x }],
          [TOP_CORNERS, { y }],
        ]),
      ),
    set_rightbottom: (id: BoxRef, x: number, y: number) =>
      setCorners(
        id,
        sides([
          [RIGHT_CORNERS, { x }],
          [BOTTOM_CORNERS, { y }],
        ]),
      ),
    set_top_left_point: (id: BoxRef, p: ChartPoint) => point(id, 0, p),
    set_bottom_right_point: (id: BoxRef, p: ChartPoint) => point(id, 2, p),
    /** 切换坐标单位时同时替换两个 X，禁止隐式解释旧坐标。 */
    set_xloc(id: BoxRef, left: number, right: number, mode: LineXLoc): void {
      const value = api.get(id)
      if (value)
        api.update(id, {
          xloc: mode,
          anchors: value.anchors.map((a, i) =>
            drawingAnchor(
              a.id,
              LEFT_CORNERS.includes(i) ? left : right,
              a.price,
              mode,
              context.barCount,
            ),
          ),
        })
    },
    set_extend: (id: BoxRef, value: LineExtend) =>
      api.update(id, { extend: checkedDrawingMember(value, Object.values(extend), 'extend') }),
    set_bgcolor: (id: BoxRef, fill: Color | (string & {})) => api.style(id, { fill }),
    set_border_color: (id: BoxRef, stroke: Color | (string & {})) => api.style(id, { stroke }),
    set_border_width: (id: BoxRef, width: number) =>
      api.style(id, { strokeWidth: drawingWidth(width, 0) }),
    set_border_style: (id: BoxRef, stroke: BoxBorderStyle) =>
      api.style(id, {
        strokeStyle: checkedDrawingMember<BoxBorderStyle>(
          stroke,
          ['solid', 'dashed', 'dotted'],
          'border_style',
        ),
      }),
    set_text: (id: BoxRef, value: string) => text(id, { value }),
    set_text_color: (id: BoxRef, color: Color | (string & {})) =>
      api.style(id, { textColor: color }),
    set_text_size: (id: BoxRef, size: number) => api.style(id, { fontSize: drawingWidth(size) }),
    set_text_halign: (id: BoxRef, align: DrawingText['align']) =>
      text(id, {
        align: checkedDrawingMember<DrawingText['align']>(
          align,
          ['left', 'center', 'right'],
          'text_halign',
        ),
      }),
    set_text_valign: (id: BoxRef, verticalAlign: DrawingText['verticalAlign']) =>
      text(id, {
        verticalAlign: checkedDrawingMember<DrawingText['verticalAlign']>(
          verticalAlign,
          ['top', 'middle', 'bottom'],
          'text_valign',
        ),
      }),
    get_left: (id: BoxRef) => {
      const value = api.get(id)
      return value ? drawingAnchorX(value.anchors[0]!) : Number.NaN
    },
    get_top: (id: BoxRef) => api.get(id)?.anchors[0]?.price ?? Number.NaN,
    get_right: (id: BoxRef) => {
      const value = api.get(id)
      return value ? drawingAnchorX(value.anchors[1]!) : Number.NaN
    },
    get_bottom: (id: BoxRef) => api.get(id)?.anchors[2]?.price ?? Number.NaN,
    copy: api.copy,
    delete: api.delete,
  })
}
