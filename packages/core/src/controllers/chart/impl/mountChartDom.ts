// 本文件负责创建 Chart 所需的 DOM 骨架，或复用调用方已提供的现成 DOM。
import { CONTROLLER_ERROR_CODES, KLineChartError } from '@/errors.js'
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
 * 创建 Chart 所需的 DOM 骨架，结构与布局对应 Vue 组件模板：flex 行内依次是左轴、
 * 可横向滚动的绘图区、右轴。非 Vue 宿主（React、Angular、WebView）没有那份 CSS，
 * 因此布局全部以内联样式给出；宿主只需提供有确定尺寸的容器。
 * @param container 调用方提供的挂载容器，其 ownerDocument 用于创建子节点。
 * @returns 新建的 DOM 骨架引用及清理回调。
 */
function buildDom(container: HTMLElement): MountedDom {
  const ownerDoc = container.ownerDocument
  if (!ownerDoc) {
    throw new KLineChartError(
      CONTROLLER_ERROR_CODES.CONFIG_INVALID,
      '[createChartController] container has no ownerDocument; cannot build DOM scaffold',
    )
  }

  const main = ownerDoc.createElement('div')
  main.className = 'klc-chart-main'
  Object.assign(main.style, {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    height: '100%',
    minWidth: '0',
  })

  // 分时双轴时才显示；非 Vue 宿主暂不切换，保持隐藏。
  const leftAxisLayer = ownerDoc.createElement('div')
  leftAxisLayer.className = 'klc-left-axis-host'
  Object.assign(leftAxisLayer.style, {
    position: 'relative',
    flex: '0 0 auto',
    display: 'none',
    touchAction: 'none',
  })

  // 纵向不滚动：画布层高度取绘图区 clientHeight，纵向溢出或滚动条会形成尺寸反馈循环。
  // touch-action 必须写在绘图区自身：它是滚动容器，浏览器求有效 touch-action 时止于最近的
  // 滚动容器，宿主上的 none（bindChartInput 设置）管不到这里，触屏拖动会变成原生滚动并 pointercancel。
  const chartContainer = ownerDoc.createElement('div')
  chartContainer.className = 'klc-chart-container'
  Object.assign(chartContainer.style, {
    position: 'relative',
    flex: '1 1 auto',
    minWidth: '0',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    userSelect: 'none',
    touchAction: 'none',
  })
  chartContainer.style.setProperty('-webkit-user-select', 'none')
  chartContainer.style.setProperty('-webkit-touch-callout', 'none')

  const scrollContent = ownerDoc.createElement('div')
  scrollContent.className = 'klc-scroll-content'
  scrollContent.style.position = 'relative'

  // 指针事件由绘图区上的输入绑定接收，画布层不拦截。
  const canvasLayer = ownerDoc.createElement('div')
  canvasLayer.className = 'klc-canvas-layer'
  Object.assign(canvasLayer.style, {
    position: 'sticky',
    top: '0',
    left: '0',
    zIndex: '1',
    pointerEvents: 'none',
  })

  const xAxisCanvas = ownerDoc.createElement('canvas')
  xAxisCanvas.className = 'klc-x-axis-canvas'
  Object.assign(xAxisCanvas.style, {
    position: 'absolute',
    left: '0',
    bottom: '0',
    display: 'block',
    zIndex: '10',
  })

  const rightAxisLayer = ownerDoc.createElement('div')
  rightAxisLayer.className = 'klc-right-axis-host'
  Object.assign(rightAxisLayer.style, { position: 'relative', flex: '0 0 auto', touchAction: 'none' })

  canvasLayer.appendChild(xAxisCanvas)
  scrollContent.appendChild(canvasLayer)
  chartContainer.appendChild(scrollContent)
  main.append(leftAxisLayer, chartContainer, rightAxisLayer)
  container.appendChild(main)

  const cleanup = (): void => {
    main.remove()
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
    mounted.rightAxisLayer.style.width = hostWidth + 'px'
  }

  return mounted
}
