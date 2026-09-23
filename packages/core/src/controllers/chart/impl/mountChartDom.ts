// 本文件负责创建 Chart 所需的 DOM 骨架，或复用调用方已提供的现成 DOM。
import { KLineChartError } from '../../../errors.js'
import type { ChartMountOptions } from '../types.js'
import { DEFAULT_OPTS } from './controllerDefaults.js'

/** Chart 挂载后的 DOM 骨架引用与清理回调。 */
export interface MountedDom {
  container: HTMLDivElement
  scrollContent?: HTMLDivElement
  canvasLayer: HTMLDivElement
  rightAxisLayer: HTMLDivElement
  leftAxisLayer?: HTMLDivElement
  xAxisCanvas: HTMLCanvasElement
  cleanup: () => void
}

/**
 * 创建 Chart 所需的 DOM 骨架。
 * @param container 调用方提供的挂载容器，其 ownerDocument 用于创建子节点。
 * @returns 新建的 DOM 骨架引用及清理回调。
 */
function buildDom(container: HTMLElement): MountedDom {
  const ownerDoc = container.ownerDocument
  if (!ownerDoc) {
    throw new KLineChartError(
      'CONTROLLER_CONFIG_INVALID',
      '[createChartController] container has no ownerDocument; cannot build DOM scaffold',
    )
  }

  let chartContainer: HTMLDivElement
  let containerCreatedByUs = false
  if (container instanceof HTMLDivElement) {
    chartContainer = container
  } else {
    chartContainer = ownerDoc.createElement('div')
    chartContainer.style.width = '100%'
    chartContainer.style.height = '100%'
    container.appendChild(chartContainer)
    containerCreatedByUs = true
  }
  chartContainer.style.position = 'relative'
  chartContainer.style.overflow = 'auto'

  const scrollContent = ownerDoc.createElement('div')
  scrollContent.className = 'klc-scroll-content'
  scrollContent.style.position = 'relative'

  const canvasLayer = ownerDoc.createElement('div')
  canvasLayer.className = 'klc-canvas-layer'
  canvasLayer.style.position = 'sticky'
  canvasLayer.style.top = '0'
  canvasLayer.style.left = '0'
  canvasLayer.style.zIndex = '1'

  const xAxisCanvas = ownerDoc.createElement('canvas')
  xAxisCanvas.className = 'klc-x-axis-canvas'

  canvasLayer.appendChild(xAxisCanvas)
  scrollContent.appendChild(canvasLayer)
  chartContainer.appendChild(scrollContent)

  const rightAxisLayer = ownerDoc.createElement('div')
  rightAxisLayer.className = 'klc-right-axis-host'
  rightAxisLayer.style.position = 'absolute'
  rightAxisLayer.style.top = '0'
  rightAxisLayer.style.right = '0'
  chartContainer.appendChild(rightAxisLayer)

  const leftAxisLayer = ownerDoc.createElement('div')
  leftAxisLayer.className = 'klc-left-axis-host'
  leftAxisLayer.style.position = 'absolute'
  leftAxisLayer.style.top = '0'
  leftAxisLayer.style.left = '0'
  chartContainer.appendChild(leftAxisLayer)

  const cleanup = (): void => {
    try {
      scrollContent.remove()
      rightAxisLayer.remove()
      leftAxisLayer.remove()
      if (containerCreatedByUs) {
        chartContainer.remove()
      }
    } catch {
      /* DOM may already be gone — best effort */
    }
  }

  return {
    container: chartContainer,
    scrollContent,
    canvasLayer,
    rightAxisLayer,
    leftAxisLayer,
    xAxisCanvas,
    cleanup,
  }
}

/**
 * 解析挂载所需的 DOM 骨架：调用方已提供 canvas/轴层时直接复用，否则新建。
 * 复用时 cleanup 为空操作（DOM 归调用方所有）；新建时补齐右轴主机的底部定位与宽度。
 * @param opts 挂载选项，含容器及可选的现成 DOM 元素。
 * @returns DOM 骨架引用与清理回调。
 */
export function mountChartDom(opts: ChartMountOptions): MountedDom {
  const hasExistingDom = !!(opts.canvasLayer && opts.rightAxisLayer && opts.xAxisCanvas)
  const mounted = hasExistingDom
    ? {
        container: opts.container as HTMLDivElement,
        scrollContent:
          (opts.container as HTMLDivElement).querySelector<HTMLDivElement>('.scroll-content') ??
          undefined,
        canvasLayer: opts.canvasLayer as HTMLDivElement,
        rightAxisLayer: opts.rightAxisLayer as HTMLDivElement,
        leftAxisLayer: opts.leftAxisLayer as HTMLDivElement | undefined,
        xAxisCanvas: opts.xAxisCanvas!,
        cleanup: () => {
          /* DOM owned by caller */
        },
      }
    : buildDom(opts.container)

  // ── Fix 0×0 sizing for buildDom()-created right axis host ──
  if (!hasExistingDom && mounted.rightAxisLayer) {
    const hostWidth =
      (opts.rightAxisWidth ?? DEFAULT_OPTS.rightAxisWidth) +
      (opts.priceLabelWidth ?? DEFAULT_OPTS.priceLabelWidth)
    mounted.rightAxisLayer.style.bottom = '0'
    mounted.rightAxisLayer.style.width = hostWidth + 'px'
  }

  return mounted
}
