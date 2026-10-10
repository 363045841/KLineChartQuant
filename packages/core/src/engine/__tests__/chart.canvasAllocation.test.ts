// @vitest-environment jsdom
/** 验证图表只为可见 pane / 轴分配画布，且后备存储等于实际绘制区域 × DPR。 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KLineData } from '@/controllers/types'
import { TIME_SHARE_PERIOD } from '@/controllers/types'
import { Chart, type ChartOptions } from '@/core/chart/index'
import {
  createChartDom,
  installChartDomStubs,
  ResizeObserverMock,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { createTrendLine } from '../drawing/__tests__/helpers/drawingTestKit'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import { MAIN_PANE_ID } from '../pane/types'

const DPR = 2
const WIDTH = 1000
const HEIGHT = 600
const AXIS_WIDTH = 70

const options: ChartOptions = {
  kWidth: 10,
  kGap: 2,
  yPaddingPx: 0,
  rightAxisWidth: 10,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 2,
  maxKWidth: 50,
  panes: [{ id: MAIN_PANE_ID, ratio: 1 }],
  priceLabelWidth: 60,
}

/** 一块画布的身份与后备存储尺寸。 */
interface CanvasSnapshot {
  readonly id: string
  readonly width: number
  readonly height: number
}

/** 生成均质日线序列。 */
function makeBars(count: number): KLineData[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: index * 86_400_000,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 100,
  }))
}

/** 以 DPR 2 挂载含主图 + 成交量副图的默认图表。 */
function mountDefaultChart(): Chart {
  const chart = new Chart(createChartDom(WIDTH, HEIGHT), options)
  ResizeObserverMock.instances[0]!.emit({
    contentRect: DOMRect.fromRect({ width: WIDTH, height: HEIGHT }),
    contentBoxSize: [{ inlineSize: WIDTH, blockSize: HEIGHT }],
    devicePixelContentBoxSize: [{ inlineSize: WIDTH * DPR, blockSize: HEIGHT * DPR }],
  })
  chart.applyCustomData({ symbol: 'PRIMARY', market: 'CN', period: 'daily', data: makeBars(120) })
  expect(chart.indicators.add('VOLUME', 'sub')).not.toBeNull()
  chart.draw()
  return chart
}

/** 按 DOM 顺序列出图表宿主内的全部画布（xAxis 由宿主提供，不计入 pane 表面）。 */
function listCanvases(chart: Chart): CanvasSnapshot[] {
  const dom = chart.getDom()
  return [dom.canvasLayer, dom.rightAxisLayer]
    .flatMap((host) => [...host.querySelectorAll('canvas')])
    .filter((canvas) => canvas !== dom.xAxisCanvas)
    .map((canvas) => ({
      id: canvas.id || canvas.className,
      width: canvas.width,
      height: canvas.height,
    }))
}

/** 期望的 pane 常驻表面：绘图区两层 + 右轴两层。 */
function residentSurfaces(chart: Chart, paneId: string): CanvasSnapshot[] {
  const viewport = chart.getViewport()!
  const pane = chart
    .getPaneRenderers()
    .map((renderer) => renderer.getPane())
    .find((candidate) => candidate.id === paneId)!
  const plot = { width: viewport.plotWidth * DPR, height: pane.height * DPR }
  const axis = { width: AXIS_WIDTH * DPR, height: pane.height * DPR }
  return [
    { id: `${paneId}-main`, ...plot },
    { id: `${paneId}-overlay`, ...plot },
    { id: `${paneId}-rightAxis`, ...axis },
    { id: `${paneId}-rightAxisOverlay`, ...axis },
  ]
}

/** 汇总后备存储字节数（RGBA 每像素 4 字节）。 */
function backingStoreBytes(canvases: ReadonlyArray<CanvasSnapshot>): number {
  return canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0)
}

describe('Chart canvas allocation', () => {
  let restoreChartDomStubs: () => void

  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(() => {
    restoreChartDomStubs = installChartDomStubs()
  })

  afterEach(() => {
    restoreChartDomStubs()
    vi.restoreAllMocks()
  })

  it('allocates only plot and right-axis surfaces for main + volume at DPR 2', async () => {
    const chart = mountDefaultChart()
    try {
      const volumePaneId = chart.getPaneRenderers()[1]!.getPane().id
      const viewport = chart.getViewport()!
      const expected = [
        ...residentSurfaces(chart, MAIN_PANE_ID),
        ...residentSurfaces(chart, volumePaneId),
        // GPU 后端的图表级共享表面，覆盖整个绘图区。
        {
          id: 'gpu-scene-canvas',
          width: viewport.plotWidth * DPR,
          height: viewport.plotHeight * DPR,
        },
      ]
      const canvases = listCanvases(chart)
      // 无图元、无左轴、无十字线：不分配正式图元、左轴与十字线表面。
      expect(sortById(canvases)).toEqual(sortById(expected))
      // 绘图区三层（两 pane 各两层 + GPU 一层）与两 pane 右轴两层，恰好覆盖可见区域。
      expect(backingStoreBytes(canvases)).toBe(
        (viewport.plotWidth * 3 + AXIS_WIDTH * 2) * viewport.plotHeight * DPR * DPR * 4,
      )
    } finally {
      await chart.destroy()
    }
  })

  it('creates the left axis pair only while it is visible and releases it afterwards', async () => {
    const chart = mountDefaultChart()
    try {
      const before = listCanvases(chart)
      chart.setCurrentPeriod(TIME_SHARE_PERIOD)
      chart.draw()
      const mainHeight = chart.getPaneRenderers()[0]!.getPane().height
      const leftAxis = listCanvases(chart).filter((canvas) => canvas.id.includes('leftAxis'))
      expect(leftAxis).toEqual([
        { id: `${MAIN_PANE_ID}-leftAxis`, width: AXIS_WIDTH * DPR, height: mainHeight * DPR },
        {
          id: `${MAIN_PANE_ID}-leftAxisOverlay`,
          width: AXIS_WIDTH * DPR,
          height: mainHeight * DPR,
        },
      ])
      const released = chart.getPaneRenderers()[0]!.getDom().leftYAxisCanvas!

      chart.setCurrentPeriod('daily')
      chart.draw()
      expect(listCanvases(chart).some((canvas) => canvas.id.includes('leftAxis'))).toBe(false)
      expect(released.isConnected).toBe(false)
      expect(released.width * released.height).toBe(0)
      expect(sortById(listCanvases(chart))).toEqual(sortById(before))
    } finally {
      await chart.destroy()
    }
  })

  it('creates the drawing surface only for the pane that holds drawings', async () => {
    const chart = mountDefaultChart()
    try {
      chart.drawing.setDrawings([
        createTrendLine('t1', {
          paneId: MAIN_PANE_ID,
          anchors: [
            { id: 'start', time: 40 * 86_400_000, price: 10 },
            { id: 'end', time: 60 * 86_400_000, price: 10.5 },
          ],
        }),
      ])
      chart.draw()
      const drawingSurfaces = listCanvases(chart).filter((canvas) => canvas.id.endsWith('-drawing'))
      const viewport = chart.getViewport()!
      const mainHeight = chart.getPaneRenderers()[0]!.getPane().height
      expect(drawingSurfaces).toEqual([
        {
          id: `${MAIN_PANE_ID}-drawing`,
          width: viewport.plotWidth * DPR,
          height: mainHeight * DPR,
        },
      ])
      // 正式图元表面位于同 pane 的行情与动态覆盖之间。
      const order = [...chart.getDom().canvasLayer.querySelectorAll('canvas')].map((c) => c.id)
      expect(order.indexOf(`${MAIN_PANE_ID}-drawing`)).toBe(
        order.indexOf(`${MAIN_PANE_ID}-overlay`) - 1,
      )
    } finally {
      await chart.destroy()
    }
  })

  it('zeroes the backing stores of a hidden pane and restores them when shown', async () => {
    const chart = mountDefaultChart()
    try {
      const volume = chart.getPaneRenderers()[1]!
      const paneId = volume.getPane().id
      expect(chart.panes.update(paneId, { visible: false })).toBe(true)
      chart.draw()
      expect(volume.getAllocatedCanvases().every((c) => c.width * c.height === 0)).toBe(true)
      expect(chart.panes.update(paneId, { visible: true })).toBe(true)
      chart.draw()
      const restored = chart.getPaneRenderers()[1]!
      expect(restored.getAllocatedCanvases().every((c) => c.width * c.height > 0)).toBe(true)
    } finally {
      await chart.destroy()
    }
  })

  it('releases every pane surface on destroy', async () => {
    const chart = mountDefaultChart()
    const surfaces = chart.getPaneRenderers().flatMap((r) => r.getAllocatedCanvases())
    await chart.destroy()
    expect(surfaces.every((canvas) => !canvas.isConnected && canvas.width === 0)).toBe(true)
  })
})

/** 稳定排序后比较，避免依赖 pane 的 DOM 插入顺序。 */
function sortById(canvases: ReadonlyArray<CanvasSnapshot>): CanvasSnapshot[] {
  return [...canvases].sort((a, b) => a.id.localeCompare(b.id))
}
