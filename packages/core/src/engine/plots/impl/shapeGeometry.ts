/** Shape Plot 的屏幕字形：一次测量文字，统一构建边界和 Canvas 路径供 Plot Layer 重放。 */
import type { ShapePlot, ShapeSize, ShapeStyle } from '@363045841yyt/klinechart-plot-contracts'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { foundationTokens } from '@/foundation/tokens/index.js'

interface Vertex {
  readonly x: number
  readonly y: number
}

export interface ShapeGlyph {
  readonly width: number
  readonly height: number
  readonly top: number
  readonly bottom: number
  readonly font: string
  readonly lineHeight: number
  readonly textY: number
  readonly lines: readonly string[]
  readonly paths: readonly (readonly Vertex[])[]
  readonly stroke: boolean
  readonly circle: boolean
}

const SHAPE_PIXELS: Readonly<Record<ShapeSize, number>> = {
  auto: 12,
  tiny: 6,
  small: 10,
  normal: 14,
  large: 20,
  huge: 28,
}
const TEXT_GAP = 3
const LABEL_PADDING = 4
const TIP_RATIO = 0.35

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

/** 测量 Shape 文字并构造完整包围盒，保证相对定位时字形和文字都不盖住 K 线。 */
export function buildShapeGlyph(plot: ShapePlot, context: RenderContext): ShapeGlyph {
  const pixels = SHAPE_PIXELS[plot.size]
  const tokens = foundationTokens[context.theme]
  // Pine 的 size 控制形状，文字使用独立且固定的字阶。
  const lineHeight = Number.parseFloat(String(tokens.text[12].lineHeight))
  const font = `${tokens.text[12].fontSize} ${tokens.fontFamily.brandCjk}`
  const lines = plot.text ? plot.text.split('\n') : []
  const label = plot.style === 'labelup' || plot.style === 'labeldown'
  const { ctx } = context
  ctx.save()
  ctx.font = font
  const textWidth = Math.max(0, ...lines.map((line) => ctx.measureText(line).width))
  ctx.restore()
  const width = label ? Math.max(pixels, textWidth + LABEL_PADDING * 2) : pixels
  const height = label ? Math.max(pixels, lines.length * lineHeight + LABEL_PADDING * 2) : pixels
  const textAbove = plot.location === 'abovebar' || plot.location === 'top'
  const textHeight = lines.length * lineHeight
  const textY = label
    ? -textHeight / 2 + lineHeight / 2
    : textAbove
      ? -height / 2 - TEXT_GAP - textHeight + lineHeight / 2
      : height / 2 + TEXT_GAP + lineHeight / 2
  let top = -height / 2
  let bottom = height / 2
  if (plot.style === 'labelup') bottom += height * TIP_RATIO
  if (plot.style === 'labeldown') top -= height * TIP_RATIO
  if (lines.length && !label) {
    top = Math.min(top, textY - lineHeight / 2)
    bottom = Math.max(bottom, textY + textHeight - lineHeight / 2)
  }
  return {
    width,
    height,
    top,
    bottom,
    font,
    lineHeight,
    textY,
    lines,
    paths: SHAPE_PATHS[plot.style](width, height),
    stroke: plot.style === 'cross' || plot.style === 'xcross',
    circle: plot.style === 'circle',
  }
}

/** 在统一 Plot 局部坐标下重放 Shape 字形与文字，颜色由逐 bar 数据覆盖声明。 */
export function paintShapeGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: ShapeGlyph,
  x: number,
  y: number,
  color: string,
  textColor: string,
): void {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, glyph.height / 6)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (glyph.circle) ctx.arc(x, y, glyph.width / 2, 0, Math.PI * 2)
  for (const path of glyph.paths) {
    const first = path[0]
    if (!first) continue
    ctx.moveTo(x + first.x, y + first.y)
    for (const vertex of path.slice(1)) ctx.lineTo(x + vertex.x, y + vertex.y)
    if (!glyph.stroke) ctx.closePath()
  }
  if (glyph.stroke) ctx.stroke()
  else ctx.fill()
  ctx.fillStyle = textColor
  ctx.font = glyph.font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const [index, line] of glyph.lines.entries()) {
    ctx.fillText(line, x, y + glyph.textY + index * glyph.lineHeight)
  }
}
