/** 绘图结果的列式通信：数值、颜色索引和 PVP 锚点共用一个转移块，声明与样式按批去重。 */
import {
  isOhlcPlot,
  type DrawingObject,
  type OhlcPlotPoint,
  type PersistedDrawingAnchor,
  type Plot,
  type PlotCollection,
  type PlotPoint,
} from '@363045841yyt/klinechart-plot-contracts'
import type { DrawingMetadata, PackedPlot, PackedPlotCollection } from '../types.js'

const SCALAR_WIDTH = 4
const OHLC_WIDTH = 8
const DRAWING_WIDTH = 6
const ANCHOR_WIDTH = 8
const PointFlag = { Missing: -1, Color: 1, TextColor: 2 }
const AnchorFlag = { Type: 1, Time: 2, Future: 4, Logical: 8, FutureValue: 16, LogicalValue: 32 }
const AnchorType = { Undefined: 0, Point: 1, Horizontal: 2, Vertical: 3 }
const TimeType = { Undefined: 0, Number: 1, String: 2 }
const Optional = { Missing: 0, Undefined: 1, Value: 2 }

/** 字符串只在一次响应内驻留；不保存跨行情版本的图形或字典。 */
class TextWriter {
  readonly values: string[] = []
  private readonly indices = new Map<string, number>()

  /** 0 表示 undefined，-1 表示 null，正数引用批次字典。 */
  code(value: string | null | undefined): number {
    if (value === undefined) return 0
    if (value === null) return -1
    let code = this.indices.get(value)
    if (code === undefined) {
      code = this.values.length + 1
      this.indices.set(value, code)
      this.values.push(value)
    }
    return code
  }
}

/** 连续写入预先计数的数值块，避免每个点创建小 TypedArray 或临时数值数组。 */
class NumberWriter {
  readonly values: Float64Array<ArrayBuffer>
  offset = 0

  constructor(length: number) {
    this.values = new Float64Array(length)
  }

  /** 追加一个数值并推进游标。 */
  put(value: number): void {
    this.values[this.offset++] = value
  }
}

/** 为扁平声明生成无歧义键；复杂 params/labels 保持原始可克隆语义，不强行归一化。 */
function flatKey(value: object): string | undefined {
  let result = ''
  const entries: [string, unknown][] = Object.entries(value)
  for (const [key, field] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    result += `${key.length}:${key}`
    if (typeof field === 'string') result += `s${field.length}:${field}`
    else if (typeof field === 'number') result += `n${Object.is(field, -0) ? '-0' : field};`
    else if (typeof field === 'boolean') result += field ? 't' : 'f'
    else if (field === undefined) result += 'u'
    else if (field === null) result += 'z'
    else return undefined
  }
  return result
}

/** 复用 PVP 的共同样式和声明，唯一 ID 与坐标不进入声明字典。 */
function metadataKey(metadata: DrawingMetadata): string | undefined {
  const { style, params, text, labels, ...base } = metadata
  if (labels !== undefined) return undefined
  const fields = [
    flatKey(base),
    flatKey(style),
    flatKey(params),
    text === undefined ? '' : flatKey(text),
  ]
  if (fields.some((field) => field === undefined)) return undefined
  return (
    `${Object.hasOwn(metadata, 'text')}:${Object.hasOwn(metadata, 'labels')}:` +
    fields.map((field) => `${field!.length}:${field}`).join('')
  )
}

/** 写完整锚点身份与可选字段，时间保留数值/字符串类型。 */
function writeAnchor(
  writer: NumberWriter,
  texts: TextWriter,
  anchor: PersistedDrawingAnchor,
): void {
  let flags = 0
  if (Object.hasOwn(anchor, 'type')) flags |= AnchorFlag.Type
  if (Object.hasOwn(anchor, 'time')) flags |= AnchorFlag.Time
  if (Object.hasOwn(anchor, 'futureOffset')) flags |= AnchorFlag.Future
  if (Object.hasOwn(anchor, 'logicalIndex')) flags |= AnchorFlag.Logical
  if (anchor.futureOffset !== undefined) flags |= AnchorFlag.FutureValue
  if (anchor.logicalIndex !== undefined) flags |= AnchorFlag.LogicalValue
  writer.put(texts.code(anchor.id))
  writer.put(flags)
  writer.put(
    anchor.type === 'point'
      ? AnchorType.Point
      : anchor.type === 'horizontal'
        ? AnchorType.Horizontal
        : anchor.type === 'vertical'
          ? AnchorType.Vertical
          : AnchorType.Undefined,
  )
  writer.put(
    typeof anchor.time === 'number'
      ? TimeType.Number
      : typeof anchor.time === 'string'
        ? TimeType.String
        : TimeType.Undefined,
  )
  writer.put(typeof anchor.time === 'string' ? texts.code(anchor.time) : (anchor.time ?? 0))
  writer.put(anchor.futureOffset ?? 0)
  writer.put(anchor.logicalIndex ?? 0)
  writer.put(anchor.price)
}

/** 打包全部大数组；hlines 等图表级小声明仍保持共享契约。 */
export function packPlotCollection(collection: PlotCollection): PackedPlotCollection {
  let length = 0
  for (const plot of collection.plots)
    length += plot.data.length * (isOhlcPlot(plot) ? OHLC_WIDTH : SCALAR_WIDTH)
  for (const fill of collection.fills) length += fill.colors.length
  for (const drawing of collection.drawings ?? [])
    length += DRAWING_WIDTH + drawing.anchors.length * ANCHOR_WIDTH
  const writer = new NumberWriter(length)
  const texts = new TextWriter()
  const plots: PackedPlot[] = collection.plots.map((plot) => {
    const offset = writer.offset
    if (isOhlcPlot(plot)) {
      const { data, ...metadata } = plot
      for (const point of data) {
        writer.put(point === undefined ? 0 : 1)
        writer.put(point?.open ?? 0)
        writer.put(point?.high ?? 0)
        writer.put(point?.low ?? 0)
        writer.put(point?.close ?? 0)
        writer.put(texts.code(point?.color))
        writer.put(texts.code(point?.wickColor))
        writer.put(texts.code(point?.borderColor))
      }
      return { type: 'ohlc', metadata, offset, length: data.length }
    }
    const { data, ...metadata } = plot
    for (const point of data) {
      const flags =
        point === undefined
          ? PointFlag.Missing
          : (Object.hasOwn(point, 'color') ? PointFlag.Color : 0) |
            (Object.hasOwn(point, 'textColor') ? PointFlag.TextColor : 0)
      writer.put(flags)
      writer.put(point?.value ?? 0)
      writer.put(texts.code(point?.color))
      writer.put(texts.code(point?.textColor))
    }
    return { type: 'scalar', metadata, offset, length: data.length }
  })
  const fills = collection.fills.map(({ colors, ...metadata }) => {
    const offset = writer.offset
    for (const color of colors) writer.put(texts.code(color))
    return { ...metadata, offset, length: colors.length }
  })
  const drawingOffset = writer.offset
  const metadata: DrawingMetadata[] = []
  const indices = new Map<string, number>()
  for (const drawing of collection.drawings ?? []) {
    const { id, zIndex, anchors, ...descriptor } = drawing
    const key = metadataKey(descriptor)
    let index = key === undefined ? undefined : indices.get(key)
    if (index === undefined) {
      index = metadata.length
      metadata.push(descriptor)
      if (key !== undefined) indices.set(key, index)
    }
    writer.put(texts.code(id))
    writer.put(index)
    writer.put(
      !Object.hasOwn(drawing, 'zIndex')
        ? Optional.Missing
        : zIndex === undefined
          ? Optional.Undefined
          : Optional.Value,
    )
    writer.put(zIndex ?? 0)
    writer.put(writer.offset + 2)
    writer.put(anchors.length)
    for (const anchor of anchors) writeAnchor(writer, texts, anchor)
  }
  const { plots: _plots, fills: _fills, drawings, ...rest } = collection
  return {
    ...rest,
    plots,
    fills,
    buffer: writer.values.buffer,
    strings: texts.values,
    ...(drawings === undefined
      ? {}
      : { drawings: { offset: drawingOffset, length: drawings.length, metadata } }),
  }
}

/** 解码一个文本索引；类型错误不能作为合法图形继续流入渲染器。 */
function textAt(strings: readonly string[], code: number): string {
  const value = strings[code - 1]
  if (value === undefined) throw new RangeError('Worker 绘图文本索引无效')
  return value
}

/** 保留可选逐点颜色。 */
function optionalText(strings: readonly string[], code: number): string | undefined {
  return code === 0 ? undefined : textAt(strings, code)
}

/** 保留 OHLC 与填充明确的 null 空值。 */
function nullableText(strings: readonly string[], code: number): string | null {
  return code === -1 ? null : textAt(strings, code)
}

/** 恢复锚点的全部领域字段，不把内部索引或通信数组暴露给渲染器。 */
function readAnchor(
  values: Float64Array,
  strings: readonly string[],
  offset: number,
): PersistedDrawingAnchor {
  const flags = values[offset + 1]!
  const type = values[offset + 2]!
  const timeType = values[offset + 3]!
  const anchor: PersistedDrawingAnchor = {
    id: textAt(strings, values[offset]!),
    price: values[offset + 7]!,
  }
  if (flags & AnchorFlag.Type)
    anchor.type =
      type === AnchorType.Point
        ? 'point'
        : type === AnchorType.Horizontal
          ? 'horizontal'
          : type === AnchorType.Vertical
            ? 'vertical'
            : undefined
  if (flags & AnchorFlag.Time)
    anchor.time =
      timeType === TimeType.Number
        ? values[offset + 4]!
        : timeType === TimeType.String
          ? textAt(strings, values[offset + 4]!)
          : undefined
  if (flags & AnchorFlag.Future)
    anchor.futureOffset = flags & AnchorFlag.FutureValue ? values[offset + 5]! : undefined
  if (flags & AnchorFlag.Logical)
    anchor.logicalIndex = flags & AnchorFlag.LogicalValue ? values[offset + 6]! : undefined
  return anchor
}

/** 只在消费端重建领域对象；一个响应的 buffer 不被协议层长期持有。 */
export function unpackPlotCollection(packed: PackedPlotCollection): PlotCollection {
  const values = new Float64Array(packed.buffer)
  const { strings } = packed
  const plots: Plot[] = packed.plots.map((plot) => {
    if (plot.type === 'ohlc') {
      const data: (OhlcPlotPoint | undefined)[] = Array.from(
        { length: plot.length },
        (_, index) => {
          const offset = plot.offset + index * OHLC_WIDTH
          if (values[offset] === 0) return undefined
          return {
            open: values[offset + 1]!,
            high: values[offset + 2]!,
            low: values[offset + 3]!,
            close: values[offset + 4]!,
            color: nullableText(strings, values[offset + 5]!),
            wickColor: nullableText(strings, values[offset + 6]!),
            borderColor: nullableText(strings, values[offset + 7]!),
          }
        },
      )
      return { ...plot.metadata, data }
    }
    const data: (PlotPoint | undefined)[] = Array.from({ length: plot.length }, (_, index) => {
      const offset = plot.offset + index * SCALAR_WIDTH
      const flags = values[offset]!
      if (flags === PointFlag.Missing) return undefined
      const point: PlotPoint = { value: values[offset + 1]! }
      if (flags & PointFlag.Color) point.color = optionalText(strings, values[offset + 2]!)
      if (flags & PointFlag.TextColor) point.textColor = optionalText(strings, values[offset + 3]!)
      return point
    })
    return { ...plot.metadata, data }
  })
  const fills = packed.fills.map(({ offset, length, ...metadata }) => ({
    ...metadata,
    colors: Array.from({ length }, (_, index) => nullableText(strings, values[offset + index]!)),
  }))
  const drawings: DrawingObject[] = []
  if (packed.drawings) {
    let offset = packed.drawings.offset
    for (let index = 0; index < packed.drawings.length; index++) {
      const metadata = packed.drawings.metadata[values[offset + 1]!]
      if (!metadata) throw new RangeError('Worker 绘图声明索引无效')
      const anchorOffset = values[offset + 4]!
      const anchorCount = values[offset + 5]!
      // 共享传输声明不等于共享可变领域对象；每个 drawing 恢复独立样式和参数。
      const drawing: DrawingObject = {
        ...metadata,
        style: { ...metadata.style },
        params: { ...metadata.params },
        ...(metadata.text === undefined ? {} : { text: { ...metadata.text } }),
        id: textAt(strings, values[offset]!),
        anchors: Array.from({ length: anchorCount }, (_, anchor) =>
          readAnchor(values, strings, anchorOffset + anchor * ANCHOR_WIDTH),
        ),
      }
      if (values[offset + 2] !== Optional.Missing)
        drawing.zIndex = values[offset + 2] === Optional.Undefined ? undefined : values[offset + 3]!
      drawings.push(drawing)
      offset = anchorOffset + anchorCount * ANCHOR_WIDTH
    }
  }
  const {
    buffer: _buffer,
    strings: _strings,
    plots: _plots,
    fills: _fills,
    drawings: batch,
    ...rest
  } = packed
  return { ...rest, plots, fills, ...(batch === undefined ? {} : { drawings }) }
}
