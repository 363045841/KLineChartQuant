import { alignToPhysicalPixelCenter } from '../../../../foundation/utils/pixelAlign'

export function createDashedLineRenderer() {
  let offscreenCanvas: HTMLCanvasElement | null = null
  let offscreenCtx: CanvasRenderingContext2D | null = null
  let cachedDashedLinesKey = ''

  function getOffscreenCanvas(
    width: number,
    height: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    if (!offscreenCanvas || offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
      offscreenCanvas = document.createElement('canvas')
      offscreenCanvas.width = width
      offscreenCanvas.height = height
      offscreenCtx = offscreenCanvas.getContext('2d')!
      cachedDashedLinesKey = ''
    }
    return { canvas: offscreenCanvas, ctx: offscreenCtx! }
  }

  function buildKey(
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
    color: string,
  ): string {
    return `${paneWidth}|${paneHeight}|${displayMin.toFixed(4)}|${displayMax.toFixed(4)}|${dpr}|${color}`
  }

  function renderToOffscreen(
    ctx: CanvasRenderingContext2D,
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
    color: string,
  ): void {
    const displayValueRange = displayMax - displayMin || 1
    const y80 = alignToPhysicalPixelCenter(
      paneHeight - ((80 - displayMin) / displayValueRange) * paneHeight,
      dpr,
    )
    const y20 = alignToPhysicalPixelCenter(
      paneHeight - ((20 - displayMin) / displayValueRange) * paneHeight,
      dpr,
    )

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, y80)
    ctx.lineTo(paneWidth, y80)
    ctx.moveTo(0, y20)
    ctx.lineTo(paneWidth, y20)
    ctx.stroke()

    ctx.restore()
  }

  function render(
    ctx: CanvasRenderingContext2D,
    paneWidth: number,
    paneHeight: number,
    displayMin: number,
    displayMax: number,
    dpr: number,
    color: string,
  ): void {
    const key = buildKey(paneWidth, paneHeight, displayMin, displayMax, dpr, color)
    if (cachedDashedLinesKey !== key) {
      cachedDashedLinesKey = key
      const { ctx: offCtx } = getOffscreenCanvas(
        Math.ceil(paneWidth * dpr),
        Math.ceil(paneHeight * dpr),
      )
      renderToOffscreen(offCtx, paneWidth, paneHeight, displayMin, displayMax, dpr, color)
    }
    if (offscreenCanvas) {
      ctx.drawImage(offscreenCanvas, 0, 0, paneWidth, paneHeight)
    }
  }

  return { render }
}
