/** 稀疏文字表面：按物理像素网格分配 Canvas，跨格文字按原序重放，避免整幅后备存储。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { paintCanvasPrimitives } from '@/rendering/primitives/impl/canvas.js'
import type { TextPaintPrimitive } from '@/rendering/primitives/types.js'

const TILE_PIXELS = 256
const TEXT_PADDING = 2
const TILE_CLASS = 'text-tile'
const CONTEXT_ERROR = '文字表面初始化失败'

interface TextTile {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
}

/** 计算字体基线、旋转和行偏移后的文字物理包围盒，不修改调用方状态。 */
function textBounds(text: TextPaintPrimitive, measure: CanvasRenderingContext2D, dpr: number) {
  measure.save()
  measure.font = text.font
  measure.textAlign = text.align
  measure.textBaseline = text.baseline
  const metrics = measure.measureText(text.text)
  measure.restore()
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(text.font)?.[1] ?? 12)
  const width = metrics.width
  const compression =
    text.maxWidth === undefined || width <= text.maxWidth ? 1 : text.maxWidth / width
  const defaultLeft =
    text.align === 'center' ? width / 2 : text.align === 'right' || text.align === 'end' ? width : 0
  const left = -(metrics.actualBoundingBoxLeft ?? defaultLeft) * compression
  const right = (metrics.actualBoundingBoxRight ?? width - defaultLeft) * compression
  const defaultAscent =
    text.baseline === 'top' || text.baseline === 'hanging'
      ? 0
      : text.baseline === 'middle'
        ? size / 2
        : size
  const top = -(metrics.actualBoundingBoxAscent ?? defaultAscent)
  const bottom = metrics.actualBoundingBoxDescent ?? size - defaultAscent
  const angle = text.rotation ?? 0
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const offset = text.rotation === undefined ? 0 : (text.offsetY ?? 0)
  const corners = [
    { x: left, y: top + offset },
    { x: right, y: top + offset },
    { x: right, y: bottom + offset },
    { x: left, y: bottom + offset },
  ]
  const xs = corners.map(({ x, y }) => (text.x + x * cosine - y * sine) * dpr)
  const ys = corners.map(({ x, y }) => (text.y + x * sine + y * cosine) * dpr)
  return {
    left: Math.floor(Math.min(...xs) - TEXT_PADDING),
    right: Math.ceil(Math.max(...xs) + TEXT_PADDING),
    top: Math.floor(Math.min(...ys) - TEXT_PADDING),
    bottom: Math.ceil(Math.max(...ys) + TEXT_PADDING),
  }
}

/** Pane 拥有池的生命周期；仅在 main 更新时替换文字，Overlay 帧保留已有像素。 */
export class TextSurfacePool {
  private readonly tiles = new Map<string, TextTile>()

  constructor(private readonly anchor: HTMLCanvasElement) {}

  /** 将整帧文字分配到相交网格；未使用的旧网格立即移除并归零。 */
  paint(
    texts: readonly TextPaintPrimitive[],
    dpr: number,
    bounds: Readonly<{ width: number; height: number }>,
    top: number,
  ): void {
    const host = this.anchor.parentElement
    if (!host) return
    const measure = this.anchor.getContext('2d')
    if (!measure) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, CONTEXT_ERROR)
    const width = Math.round(bounds.width * dpr)
    const height = Math.round(bounds.height * dpr)
    const groups = new Map<string, { x: number; y: number; texts: TextPaintPrimitive[] }>()
    for (const text of texts) {
      if (text.text.length === 0) continue
      const box = textBounds(text, measure, dpr)
      if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite)) continue
      const left = Math.max(0, box.left)
      const right = Math.min(width, box.right)
      const upper = Math.max(0, box.top)
      const lower = Math.min(height, box.bottom)
      if (right <= left || lower <= upper) continue
      for (let y = Math.floor(upper / TILE_PIXELS) * TILE_PIXELS; y < lower; y += TILE_PIXELS) {
        for (let x = Math.floor(left / TILE_PIXELS) * TILE_PIXELS; x < right; x += TILE_PIXELS) {
          const key = `${x}:${y}`
          let group = groups.get(key)
          if (!group) {
            group = { x, y, texts: [] }
            groups.set(key, group)
          }
          group.texts.push({ ...text, x: text.x - x / dpr, y: text.y - y / dpr })
        }
      }
    }
    for (const [key, tile] of this.tiles) {
      if (groups.has(key)) continue
      tile.canvas.remove()
      tile.canvas.width = 0
      tile.canvas.height = 0
      this.tiles.delete(key)
    }
    for (const [key, group] of groups) {
      let tile = this.tiles.get(key)
      if (!tile) {
        const canvas = host.ownerDocument.createElement('canvas')
        canvas.className = TILE_CLASS
        canvas.style.cssText = 'position:absolute;pointer-events:none'
        canvas.style.zIndex = this.anchor.style.zIndex
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, CONTEXT_ERROR)
        host.insertBefore(canvas, this.anchor.nextSibling)
        tile = { canvas, ctx }
        this.tiles.set(key, tile)
      }
      const { canvas, ctx } = tile
      const tileWidth = Math.min(TILE_PIXELS, width - group.x)
      const tileHeight = Math.min(TILE_PIXELS, height - group.y)
      if (canvas.width !== tileWidth) canvas.width = tileWidth
      if (canvas.height !== tileHeight) canvas.height = tileHeight
      canvas.style.left = `${group.x / dpr}px`
      canvas.style.top = `${top + group.y / dpr}px`
      canvas.style.width = `${tileWidth / dpr}px`
      canvas.style.height = `${tileHeight / dpr}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, tileWidth, tileHeight)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintCanvasPrimitives(ctx, group.texts, dpr)
    }
  }

  /** 释放全部文字像素；隐藏、后端切换、空行情和销毁共用此入口。 */
  clear(): void {
    for (const { canvas } of this.tiles.values()) {
      canvas.remove()
      canvas.width = 0
      canvas.height = 0
    }
    this.tiles.clear()
  }
}
