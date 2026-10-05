/** 独立图表级 Canvas2D 十字线表面，浏览器直接合成到 pane 画布之上。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../../errors.js'
import { alignToPhysicalPixelCenter } from '../../../../foundation/utils/pixelAlign.js'
import type { CrosshairOverlayFrame } from '../types.js'

const CROSSHAIR_CANVAS_CLASS = 'crosshair-canvas'
const CANVAS_TAG = 'canvas'
const CANVAS_CONTEXT = '2d'
const CANVAS_CONTEXT_ERROR = '十字线画布初始化失败'
const OVERLAY_STYLE =
  'position:absolute;left:0;top:0;pointer-events:none;background:transparent;z-index:3'
const LINE_CAP = 'butt'
const DASH_PATTERN = [4, 4]
const CENTER_GAP = 2

export class CrosshairOverlay {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  /** 创建覆盖整个绘图区的表面，由当前图表实例独占其生命周期。 */
  constructor(host: HTMLElement) {
    this.canvas = host.ownerDocument.createElement(CANVAS_TAG)
    this.canvas.className = CROSSHAIR_CANVAS_CLASS
    this.canvas.style.cssText = OVERLAY_STYLE
    const ctx = this.canvas.getContext(CANVAS_CONTEXT)
    if (!ctx) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, CANVAS_CONTEXT_ERROR)
    this.ctx = ctx
    host.appendChild(this.canvas)
  }

  /** 每帧按引擎视口同步物理尺寸并重新绘制，隐藏十字线时同样清除旧像素。 */
  paint(frame: CrosshairOverlayFrame): void {
    const { plotWidth, plotHeight, dpr } = frame.viewport
    const width = Math.max(0, Math.round(plotWidth * dpr))
    const height = Math.max(0, Math.round(plotHeight * dpr))
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    this.canvas.style.width = `${plotWidth}px`
    this.canvas.style.height = `${plotHeight}px`
    this.clear()
    if (!frame.pos || width === 0 || height === 0) return

    const { activePane, price, pos } = frame
    // 先在 chart 坐标中确定价格交点，再只对齐一次，避免各 pane 分别舍入导致相位偏差。
    const globalY =
      activePane && price !== null ? activePane.top + activePane.yAxis.priceToY(price) : pos.y
    const ix = alignToPhysicalPixelCenter(pos.x, dpr)
    const iy = alignToPhysicalPixelCenter(globalY, dpr)
    // 四向各留出至少 2 个逻辑像素，按整物理像素偏移以保持起点清晰。
    const gap = Math.ceil(CENTER_GAP * dpr) / dpr
    const ctx = this.ctx
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = frame.color
    ctx.lineWidth = 1 / dpr
    ctx.lineCap = LINE_CAP
    ctx.setLineDash(DASH_PATTERN)
    ctx.lineDashOffset = 0

    /** 独立路径从中央空隙外向外描边，使四个方向的 dash 对称展开。 */
    const strokeRay = (startX: number, startY: number, endX: number, endY: number): void => {
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(endX, endY)
      ctx.stroke()
    }

    // 整条纵线只画一次，pane 分隔区域同样连续，不再投影或拼接局部线段。
    if (iy - gap > 0) strokeRay(ix, iy - gap, ix, 0)
    if (iy + gap < plotHeight) strokeRay(ix, iy + gap, ix, plotHeight)
    if (activePane && price !== null) {
      // 水平线仍局限于活跃 pane，价格移出该 pane 时不画到相邻副图。
      ctx.beginPath()
      ctx.rect(0, activePane.top, plotWidth, activePane.height)
      ctx.clip()
      if (ix - gap > 0) strokeRay(ix - gap, iy, 0, iy)
      if (ix + gap < plotWidth) strokeRay(ix + gap, iy, plotWidth, iy)
    }
    ctx.restore()
  }

  /** 使用物理像素清空整张表面，不依赖上一帧的坐标变换。 */
  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /** 移除实例拥有的表面，释放 Canvas 像素缓冲。 */
  dispose(): void {
    this.canvas.remove()
    this.canvas.width = 0
    this.canvas.height = 0
  }
}
