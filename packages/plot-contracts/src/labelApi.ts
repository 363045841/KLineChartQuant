/** Pine 风格价格标签 API；使用公共单锚点对象和 Text 图元。 */
import { Color } from './color.js'
import type {
  DrawingLabelApi,
  DrawingObjectContext,
  DrawingObjectStore,
  DrawingStyle,
  DrawingText,
  LabelOptions,
  LabelRef,
  LineXLoc,
} from './drawing.js'
import { xloc } from './drawing.js'
import {
  checkedDrawingMember,
  createOwnedDrawingApi,
  drawingAnchor,
  drawingAnchorX,
  drawingWidth,
} from './drawingApi.js'

/** 标签垂直偏移使用逻辑像素；非有限值在 API 边界拒绝。 */
function checkedOffsetY(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('label 垂直偏移必须是有限数值')
  return value
}

/** 创建价格锚定的纯文字标签；参数沿用 Pine 的位置顺序。 */
export function createDrawingLabelApi(
  store: DrawingObjectStore,
  context: DrawingObjectContext,
): DrawingLabelApi {
  const api = createOwnedDrawingApi(store, 'label', context.ownerId, () => context.maxObjects)
  /** 更新锚点分量并保持坐标单位。 */
  function coordinate(id: LabelRef, x?: number, y?: number): void {
    const value = api.get(id)
    if (!value) return
    const anchor = value.anchors[0]!
    api.update(id, {
      anchors: [
        drawingAnchor(
          anchor.id,
          x === undefined ? drawingAnchorX(anchor) : x,
          y === undefined ? anchor.price : y,
          value.xloc!,
          context.barCount,
        ),
      ],
    })
  }
  /** 更新完整文字样式快照。 */
  function text(id: LabelRef, patch: Partial<DrawingText>): void {
    const value = api.get(id)
    if (value?.text) api.update(id, { text: { ...value.text, ...patch } })
  }
  /** 修改图元样式；对象已删除时忽略。 */
  function styleOf(id: LabelRef, patch: Partial<DrawingStyle>): void {
    if (api.get(id)) api.style(id, patch)
  }
  /** 两种调用形态共用的构造；参数在入口处归一。 */
  function createLabel(
    x: number,
    y: number,
    content: string,
    mode: LineXLoc,
    color: Color | (string & {}),
    textcolor: Color | (string & {}) | undefined,
    size: number,
    align: DrawingText['align'],
    offsetY: number,
  ): LabelRef {
    checkedDrawingMember(align, ['left', 'center', 'right'], 'textalign')
    const id = store.nextId()
    return api.insert({
      id,
      kind: 'label',
      paneId: context.paneId,
      ownerId: context.ownerId,
      visible: true,
      params: {},
      xloc: mode,
      anchors: [drawingAnchor(`${id}:0`, x, y, mode, context.barCount)],
      style: {
        stroke: color,
        ...(textcolor === undefined ? {} : { textColor: textcolor }),
        fontSize: drawingWidth(size),
      },
      text: {
        value: content,
        align,
        verticalAlign: 'middle',
        offsetY: checkedOffsetY(offsetY),
      },
    })
  }
  type Tail = [
    text?: string,
    mode?: LineXLoc,
    location?: 'price',
    color?: Color | (string & {}),
    style?: 'none',
    textcolor?: Color | (string & {}),
    size?: number,
    align?: DrawingText['align'],
    offsetY?: number,
  ]
  function create(
    x: number,
    y: number,
    text?: string,
    mode?: LineXLoc,
    location?: 'price',
    color?: Color | (string & {}),
    style?: 'none',
    textcolor?: Color | (string & {}),
    size?: number,
    align?: DrawingText['align'],
    offsetY?: number,
  ): LabelRef
  function create(options: LabelOptions): LabelRef
  /** 位置参数保留 Pine 顺序；选项对象形态走同一套构造。 */
  function create(...args: [LabelOptions] | [number, number, ...Tail]): LabelRef {
    if (args.length === 1) {
      const {
        x,
        y,
        text = '',
        xloc: mode = xloc.bar_index,
        color = Color.Blue,
        textColor,
        size = 12,
        align = 'center',
        offsetY = 0,
      } = args[0]
      return createLabel(x, y, text, mode, color, textColor, size, align, offsetY)
    }
    const [
      x,
      y,
      content = '',
      mode = xloc.bar_index,
      location = 'price',
      color = Color.Blue,
      style = 'none',
      textcolor,
      size = 12,
      align = 'center',
      offsetY = 0,
    ] = args
    checkedDrawingMember(location, ['price'], 'yloc')
    checkedDrawingMember(style, ['none'], 'label style')
    return createLabel(x, y, content, mode, color, textcolor, size, align, offsetY)
  }
  return Object.freeze({
    style_none: 'none',
    new: create,
    get all() {
      return api.all()
    },
    set_x: (id: LabelRef, x: number) => coordinate(id, x),
    set_y: (id: LabelRef, y: number) => coordinate(id, undefined, y),
    set_xy: coordinate,
    set_text: (id: LabelRef, value: string) => text(id, { value }),
    set_textcolor: (id: LabelRef, color: Color | (string & {})) => styleOf(id, { textColor: color }),
    set_size: (id: LabelRef, size: number) => styleOf(id, { fontSize: drawingWidth(size) }),
    set_textalign: (id: LabelRef, align: DrawingText['align']) =>
      text(id, {
        align: checkedDrawingMember<DrawingText['align']>(
          align,
          ['left', 'center', 'right'],
          'textalign',
        ),
      }),
    set_yoffset: (id: LabelRef, offsetY: number) => text(id, { offsetY: checkedOffsetY(offsetY) }),
    get_x: (id: LabelRef) => {
      const value = api.get(id)
      return value ? drawingAnchorX(value.anchors[0]!) : Number.NaN
    },
    get_y: (id: LabelRef) => api.get(id)?.anchors[0]?.price ?? Number.NaN,
    get_text: (id: LabelRef) => api.get(id)?.text?.value ?? null,
    get_yoffset: (id: LabelRef) => api.get(id)?.text?.offsetY ?? 0,
    copy: api.copy,
    delete: api.delete,
  })
}
