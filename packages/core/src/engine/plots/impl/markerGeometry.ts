/** Shape、Char、Arrow 的屏幕字形：构建边界、排版和跨后端原语供 Plot Layer 重放。 */
import type { CharPlot, ShapePlot, ShapeStyle } from '@363045841yyt/klinechart-plot-contracts'
import type { PrimitiveRenderContext } from '@/foundation/plugin/index.js'
import { foundationTokens } from '@/foundation/tokens/index.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'

import { markerBoxSize } from './plotSize.js'

interface Vertex {
  readonly x: number
  readonly y: number
}

export interface MarkerGlyph {
  readonly width: number
  readonly height: number
  readonly top: number
  readonly bottom: number
  readonly font: string
  readonly lineHeight: number
  readonly textY: number
  readonly lines: readonly string[]
  readonly paths: readonly (readonly Vertex[])[]
  /** 描边线宽；缺省表示填充字形，此时路径自动闭合。 */
  readonly strokeWidth?: number
  readonly circle: boolean
  readonly char: string
  readonly charFont: string
}

const TEXT_GAP = 3
const LABEL_PADDING = 4
const TIP_RATIO = 0.35
/** 形状文字固定使用的字阶；与 Foundation Token 的 12px 步骤对应。 */
const SHAPE_TEXT_STEP = 12

type PathBuilder = (width: number, height: number) => readonly (readonly Vertex[])[]

/** 将归一化顶点变成屏幕尺寸；各形状共用同一种路径数据。 */
function polygon(vertices: readonly (readonly [number, number])[]): PathBuilder {
  return (width, height) => [vertices.map(([x, y]) => ({ x: x * width, y: y * height }))]
}

/** 构建向上或向下的标签背景，尖角始终指向 K 线。 */
function labelPath(direction: number): PathBuilder {
  return (width, height) => [
    [
      { x: -width / 2, y: (-direction * height) / 2 },
      { x: width / 2, y: (-direction * height) / 2 },
      { x: width / 2, y: (direction * height) / 2 },
      { x: Math.min(width / 4, height * 0.2), y: (direction * height) / 2 },
      { x: 0, y: direction * height * (0.5 + TIP_RATIO) },
      { x: -Math.min(width / 4, height * 0.2), y: (direction * height) / 2 },
      { x: -width / 2, y: (direction * height) / 2 },
    ],
  ]
}

const SHAPE_PATHS: Readonly<Record<ShapeStyle, PathBuilder>> = {
  // arrowup/arrowdown 是 plotshape 的固定尺寸字形；变长箭头由 buildArrowGlyph 构造。
  xcross: (width, height) => [
    [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
    ],
    [
      { x: -width / 2, y: height / 2 },
      { x: width / 2, y: -height / 2 },
    ],
  ],
  cross: (width, height) => [
    [
      { x: -width / 2, y: 0 },
      { x: width / 2, y: 0 },
    ],
    [
      { x: 0, y: -height / 2 },
      { x: 0, y: height / 2 },
    ],
  ],
  circle: () => [],
  square: polygon([
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ]),
  diamond: polygon([
    [0, -0.5],
    [0.5, 0],
    [0, 0.5],
    [-0.5, 0],
  ]),
  triangleup: polygon([
    [0, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ]),
  triangledown: polygon([
    [-0.5, -0.5],
    [0.5, -0.5],
    [0, 0.5],
  ]),
  arrowup: polygon([
    [0, -0.5],
    [0.5, 0],
    [0.15, 0],
    [0.15, 0.5],
    [-0.15, 0.5],
    [-0.15, 0],
    [-0.5, 0],
  ]),
  arrowdown: polygon([
    [0, 0.5],
    [0.5, 0],
    [0.15, 0],
    [0.15, -0.5],
    [-0.15, -0.5],
    [-0.15, 0],
    [-0.5, 0],
  ]),
  labelup: labelPath(1),
  labeldown: labelPath(-1),
  flag: polygon([
    [-0.4, 0.5],
    [-0.5, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.2, -0.15],
    [0.5, 0.15],
    [-0.4, 0.15],
  ]),
}

/** 标记文字度量：字阶固定，宽度已测好供包围盒复用。 */
interface MarkerText {
  readonly font: string
  readonly lineHeight: number
  readonly lines: readonly string[]
  readonly width: number
}

let measureCtx: CanvasRenderingContext2D | null = null

/** 文本度量只依赖字体，用独立上下文，不读取也不修改绘制目标。 */
function measurementContext(): CanvasRenderingContext2D {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) throw new Error('Text measurement context unavailable')
  return measureCtx
}

/** 一次测量覆盖文字与字符，滚动重放不再重复测量。 */
function measureMarker(
  plot: ShapePlot | CharPlot,
  context: PrimitiveRenderContext,
  pixels: number,
): { text: MarkerText; char: string; charFont: string; charWidth: number } {
  const tokens = foundationTokens[context.theme]
  // Pine 的 size 控制形状，文字使用独立且固定的字阶。
  const step = tokens.text[SHAPE_TEXT_STEP]
  const lineHeight = Number.parseFloat(String(step.lineHeight))
  const font = `${step.fontSize} ${tokens.fontFamily.brandCjk}`
  const lines = plot.text ? plot.text.split('\n') : []
  const char = plot.kind === 'char' ? plot.char : ''
  const charFont = `${pixels}px ${tokens.fontFamily.brandCjk}`
  const ctx = context.measureContext ?? measurementContext()
  ctx.font = font
  const width = Math.max(0, ...lines.map((line) => ctx.measureText(line).width))
  ctx.font = charFont
  const charWidth = char ? ctx.measureText(char).width : 0
  return { text: { font, lineHeight, lines, width }, char, charFont, charWidth }
}

/** 字符标记没有形状，只有 Shape 携带 style。 */
function markerStyle(plot: ShapePlot | CharPlot): ShapeStyle | undefined {
  return plot.kind === 'shape' ? plot.style : undefined
}

/** label 形状把文字包进背景框，因此包围盒随文字变化。 */
function isLabelStyle(style: ShapeStyle | undefined): boolean {
  return style === 'labelup' || style === 'labeldown'
}

/** 包围盒：label 容纳文字，字符用实测宽度，其余用 size 像素尺寸。 */
function markerBox(
  plot: ShapePlot | CharPlot,
  pixels: number,
  text: MarkerText,
  charWidth: number,
  label: boolean,
): { width: number; height: number } {
  if (label)
    return {
      width: Math.max(pixels, text.width + LABEL_PADDING * 2),
      height: Math.max(pixels, text.lines.length * text.lineHeight + LABEL_PADDING * 2),
    }
  if (plot.kind === 'shape') return { width: pixels, height: pixels }
  return { width: charWidth, height: plot.char ? pixels : 0 }
}

/** 文字纵向位置：label 居中，其余按相对定位方向贴到字形外侧。 */
function markerTextY(
  location: ShapePlot['location'],
  label: boolean,
  height: number,
  text: MarkerText,
): number {
  const textHeight = text.lines.length * text.lineHeight
  if (label) return -textHeight / 2 + text.lineHeight / 2
  const above = location === 'abovebar' || location === 'top'
  return above
    ? -height / 2 - TEXT_GAP - textHeight + text.lineHeight / 2
    : height / 2 + TEXT_GAP + text.lineHeight / 2
}

/** 上下边界：label 尖角向外扩，附带文字时把文字一并纳入包围盒。 */
function markerBounds(
  style: ShapeStyle | undefined,
  label: boolean,
  height: number,
  textY: number,
  textHeight: number,
  lineHeight: number,
): { top: number; bottom: number } {
  const top = style === 'labeldown' ? -height / 2 - height * TIP_RATIO : -height / 2
  const bottom = style === 'labelup' ? height / 2 + height * TIP_RATIO : height / 2
  if (label || textHeight === 0) return { top, bottom }
  // 文字首行中心在 textY，所以块顶是 textY 上移半个行高，块底再加整段文字高度。
  return {
    top: Math.min(top, textY - lineHeight / 2),
    bottom: Math.max(bottom, textY + textHeight - lineHeight / 2),
  }
}

/** 测量 Shape 或 Char 并构造完整包围盒，保证相对定位时字形和文字都不盖住 K 线。 */
export function buildMarkerGlyph(plot: ShapePlot | CharPlot, context: PrimitiveRenderContext): MarkerGlyph {
  const pixels = markerBoxSize(plot.size)
  const style = markerStyle(plot)
  const label = isLabelStyle(style)
  const measured = measureMarker(plot, context, pixels)
  const box = markerBox(plot, pixels, measured.text, measured.charWidth, label)
  const textHeight = measured.text.lines.length * measured.text.lineHeight
  const textY = markerTextY(plot.location, label, box.height, measured.text)
  return {
    ...box,
    ...markerBounds(style, label, box.height, textY, textHeight, measured.text.lineHeight),
    font: measured.text.font,
    lineHeight: measured.text.lineHeight,
    textY,
    lines: measured.text.lines,
    paths: style === undefined ? [] : SHAPE_PATHS[style](box.width, box.height),
    strokeWidth: style === 'cross' || style === 'xcross' ? Math.max(1, box.height / 6) : undefined,
    circle: style === 'circle',
    char: measured.char,
    charFont: measured.charFont,
  }
}

/** 两种屏幕外观的固定尺寸（CSS px）；数值和箭头总长不参与头部尺寸计算。 */
const ARROW_SOLID = { headHalfWidth: 4, stemHalfWidth: 2, strokeWidth: undefined }
const ARROW_LINE = { headHalfWidth: 1.5, stemHalfWidth: 0, strokeWidth: 1 }
const ARROW_LINE_ZOOM_PROGRESS = 0.05

/** 只用现有缩放档位选择外观，不把 K 线间距或数值幅度混入几何。 */
function arrowStyle(context: PrimitiveRenderContext): typeof ARROW_SOLID | typeof ARROW_LINE {
  const { zoomLevel, zoomLevelCount } = context
  if (zoomLevel === undefined || zoomLevelCount === undefined || zoomLevelCount < 2)
    return ARROW_SOLID
  return (zoomLevel - 1) / (zoomLevelCount - 1) < ARROW_LINE_ZOOM_PROGRESS
    ? ARROW_LINE
    : ARROW_SOLID
}

/**
 * 在尖端为原点、尾端朝下的坐标中构造轮廓，再统一居中并翻转方向。
 * 实心头和杆一次填充；线形头保持开放，杆线直接连接尖端。
 */
function arrowPaths(
  height: number,
  up: boolean,
  style: ReturnType<typeof arrowStyle>,
): readonly (readonly Vertex[])[] {
  const { headHalfWidth: head, stemHalfWidth: stem, strokeWidth } = style
  const base = head * Math.sqrt(3)
  const paths: readonly (readonly (readonly [number, number])[])[] =
    strokeWidth === undefined
      ? [
          [
            [0, 0],
            [head, base],
            [stem, base],
            [stem, height],
            [-stem, height],
            [-stem, base],
            [-head, base],
          ],
        ]
      : [
          [
            [head, base],
            [0, 0],
            [-head, base],
          ],
          [
            [0, 0],
            [0, height],
          ],
        ]
  const direction = up ? 1 : -1
  return paths.map((path) => path.map(([x, y]) => ({ x, y: direction * (y - height / 2) })))
}

/** 固定头部、只伸缩杆长；包围盒使用实际总高，确保尖端始终贴近 bar。 */
export function buildArrowGlyph(height: number, up: boolean, context: PrimitiveRenderContext): MarkerGlyph {
  const style = arrowStyle(context)
  const totalHeight = Math.max(height, style.headHalfWidth * Math.sqrt(3))
  return {
    width: style.headHalfWidth * 2,
    height: totalHeight,
    top: -totalHeight / 2,
    bottom: totalHeight / 2,
    font: '',
    lineHeight: 0,
    textY: 0,
    lines: [],
    char: '',
    charFont: '',
    paths: arrowPaths(totalHeight, up, style),
    strokeWidth: style.strokeWidth,
    circle: false,
  }
}

/** 把标记字形映射成有序公共原语，颜色由逐 bar 数据覆盖声明。 */
export function markerPrimitives(
  glyph: MarkerGlyph,
  x: number,
  y: number,
  color: string,
  textColor: string,
  dpr: number,
): PaintPrimitive[] {
  const paths = glyph.paths.map(path => path.map(point => ({ x: x + point.x, y: y + point.y })))
  const commands: PaintPrimitive[] = []
  if (glyph.circle) commands.push({ kind: 'circle', x, y, radius: glyph.width / 2, color })
  if (paths.length) commands.push(glyph.strokeWidth === undefined
    ? { kind: 'fill', paths, color }
    : { kind: 'stroke', paths, color, width: glyph.strokeWidth, cap: 'round', join: 'round' })
  if (glyph.char) {
    commands.push({ kind: 'text', text: glyph.char, x, y, color, font: glyph.charFont, align: 'center', baseline: 'middle' })
  }
  for (const [index, line] of glyph.lines.entries()) {
    commands.push({ kind: 'text', text: line, x, y: y + glyph.textY + index * glyph.lineHeight, color: textColor, font: glyph.font, align: 'center', baseline: 'middle' })
  }
  return commands
}
