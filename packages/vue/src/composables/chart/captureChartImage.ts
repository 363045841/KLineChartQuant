/** 按引擎 DPR 合成原始 Canvas 像素与 DOM 浮层，避免图表经过 SVG 重采样。 */
import type { ChartFrameCaptureContext } from '@363045841yyt/klinechart-core/controllers'
const CHART_BACKGROUND_HOSTS = '.chart-main, .chart-container, .left-axis-host, .right-axis-host'
const CLIPPING_OVERFLOW = new Set(['hidden', 'clip', 'auto', 'scroll'])
const SVG_MIME_TYPE = 'image/svg+xml'
const CANVAS_CONTEXT_ERROR = '截图画布初始化失败'

type CanvasSnapshot = {
  image: Promise<HTMLCanvasElement>
  x: number
  y: number
  clip: { x: number; y: number; width: number; height: number }
  stackingOrder: number[]
}

/** 比较祖先层叠顺序；相同层级保留 DOM 顺序。 */
function compareStackingOrder(left: CanvasSnapshot, right: CanvasSnapshot): number {
  const count = Math.max(left.stackingOrder.length, right.stackingOrder.length)
  for (let index = 0; index < count; index += 1) {
    const difference = (left.stackingOrder[index] ?? 0) - (right.stackingOrder[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** 同步复制可见 Canvas，并记录整数物理像素位置、祖先裁剪区域和层叠顺序。 */
function snapshotCanvases(element: HTMLElement, frame: ChartFrameCaptureContext): CanvasSnapshot[] {
  const { dpr } = frame
  const rootBounds = element.getBoundingClientRect()
  const snapshots: CanvasSnapshot[] = []
  for (const source of element.querySelectorAll('canvas')) {
    const bounds = source.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0 || source.width === 0 || source.height === 0) continue
    let left = rootBounds.left
    let top = rootBounds.top
    let right = rootBounds.right
    let bottom = rootBounds.bottom
    const stackingOrder: number[] = []
    let visible = true
    for (let node: HTMLElement | null = source; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        visible = false
        break
      }
      if (style.zIndex !== 'auto') stackingOrder.unshift(Number(style.zIndex))
      if (node !== source) {
        const parentBounds = node.getBoundingClientRect()
        if (CLIPPING_OVERFLOW.has(style.overflowX)) {
          left = Math.max(left, parentBounds.left + node.clientLeft)
          right = Math.min(right, parentBounds.left + node.clientLeft + node.clientWidth)
        }
        if (CLIPPING_OVERFLOW.has(style.overflowY)) {
          top = Math.max(top, parentBounds.top + node.clientTop)
          bottom = Math.min(bottom, parentBounds.top + node.clientTop + node.clientHeight)
        }
      }
      if (node === element) break
    }
    if (!visible || right <= left || bottom <= top) continue
    let image: Promise<HTMLCanvasElement>
    if (frame.surface?.source === source) {
      // GPU 由后端在同帧呈现前读取，不能把 WebGPU canvas 当作普通 Canvas2D 复制。
      image = frame.surface.image
    } else {
      const copy = document.createElement('canvas')
      copy.width = source.width
      copy.height = source.height
      const context = copy.getContext('2d')
      if (!context) throw new Error(CANVAS_CONTEXT_ERROR)
      // 不传目标宽高，原始 buffer 按一比一复制，不放大也不缩小。
      context.drawImage(source, 0, 0)
      image = Promise.resolve(copy)
    }
    snapshots.push({
      image,
      x: Math.round((bounds.left - rootBounds.left) * dpr),
      y: Math.round((bounds.top - rootBounds.top) * dpr),
      clip: {
        x: Math.round((left - rootBounds.left) * dpr),
        y: Math.round((top - rootBounds.top) * dpr),
        width: Math.round((right - rootBounds.left) * dpr) - Math.round((left - rootBounds.left) * dpr),
        height: Math.round((bottom - rootBounds.top) * dpr) - Math.round((top - rootBounds.top) * dpr),
      },
      stackingOrder,
    })
  }
  return snapshots.sort(compareStackingOrder)
}

/** 只转换 DOM 内容；去掉画布宿主背景，使 DOM 图例和控件能透明叠加。 */
async function captureDomOverlay(
  element: HTMLElement,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  const { toSvg } = await import('html-to-image')
  const svgUrl = await toSvg(element, {
    width,
    height,
    filter: (node) => !(node instanceof HTMLCanvasElement),
  })
  const svgText = await (await fetch(svgUrl)).text()
  const svg = new DOMParser().parseFromString(svgText, SVG_MIME_TYPE)
  for (const host of svg.querySelectorAll(CHART_BACKGROUND_HOSTS)) {
    host.setAttribute('style', `${host.getAttribute('style') ?? ''};background:transparent !important;`)
  }
  // foreignObject 使用内嵌 data URL，保持最终 Canvas 可导出为 PNG。
  const image = new Image()
  image.src = `data:${SVG_MIME_TYPE};charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
  await image.decode()
  return image
}

/** 按引擎物理尺寸输出图表，Canvas 原始像素和 DOM 浮层分别合成。 */
export async function captureChartImage(
  element: HTMLElement,
  frame: ChartFrameCaptureContext,
  backgroundColor: string,
): Promise<HTMLCanvasElement> {
  const { dpr } = frame
  const bounds = element.getBoundingClientRect()
  // 在异步 DOM 转换前固定所有画布内容，避免不同图层来自不同帧。
  const snapshots = snapshotCanvases(element, frame)
  const [imageCopies, overlay] = await Promise.all([
    Promise.all(snapshots.map((snapshot) => snapshot.image)),
    captureDomOverlay(element, bounds.width, bounds.height),
    // 即使 GPU 表面暂时不可见，也消费其读回结果，避免设备丢失产生未处理拒绝。
    frame.surface?.image,
  ])
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bounds.width * dpr)
  canvas.height = Math.round(bounds.height * dpr)
  const context = canvas.getContext('2d')
  if (!context) throw new Error(CANVAS_CONTEXT_ERROR)
  context.fillStyle = backgroundColor
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = false
  for (const [index, snapshot] of snapshots.entries()) {
    context.save()
    context.beginPath()
    context.rect(snapshot.clip.x, snapshot.clip.y, snapshot.clip.width, snapshot.clip.height)
    context.clip()
    context.drawImage(imageCopies[index]!, snapshot.x, snapshot.y)
    context.restore()
  }
  // DOM 文本保留浏览器抗锯齿，Canvas 图表不参与这次 SVG 栅格化。
  context.imageSmoothingEnabled = true
  context.drawImage(overlay, 0, 0, canvas.width, canvas.height)
  return canvas
}
