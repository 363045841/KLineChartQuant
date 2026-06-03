import type { DrawingObject, DrawingKind, DrawingAnchor, DrawingStyle } from '../../plugin'
import type { DrawingChartAdapter } from '../../controllers/types'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import { computeLinearRegression } from './index'

export type DrawingToolId =
  | 'cursor'
  | 'trend-line'
  | 'ray'
  | 'h-line'
  | 'h-ray'
  | 'v-line'
  | 'crosshair-line'
  | 'info-line'
  | 'parallel-channel'
  | 'regression-channel'
  | 'flat-line'
  | 'disjoint-channel'

export interface DrawingAnchorInput {
  index: number
  time?: number
  price: number
}

export interface DrawingInteractionCallbacks {
  onDrawingCreated?: (drawing: DrawingObject) => void
  onToolChange?: (toolId: DrawingToolId) => void
  onDrawingSelected?: (drawing: DrawingObject | null) => void
}

type HitResult =
  | { drawing: DrawingObject; anchorIndex: number }
  | { drawing: DrawingObject }

type LineSegment = { a: { x: number; y: number }; b: { x: number; y: number } }

type RegressionChannelGeometry = {
  segments: LineSegment[]
  endpoints: Array<{ point: { x: number; y: number }; anchorIndex: 0 | 1 }>
}

interface DragState {
  drawingId: string
  anchorIndex?: number
  snapshot: DrawingAnchor[]
  startMouse: { x: number; y: number }
}

const ANCHOR_HIT_RADIUS = 8
const LINE_HIT_RADIUS = 6

/**
 * 绘图交互控制器
 * 封装绘图工具的交互逻辑，与 Vue 组件解耦
 */
export class DrawingInteractionController {
  private adapter: DrawingChartAdapter
  private activeTool: DrawingToolId = 'cursor'
  private pendingAnchors: DrawingAnchorInput[] = []
  private drawings: DrawingObject[] = []
  private callbacks: DrawingInteractionCallbacks = {}
  private previewDrawingId = '__preview__'
  private dragState: DragState | null = null
  private selectedDrawingId: string | null = null

  // 单锚点工具列表
  private static readonly SINGLE_ANCHOR_TOOLS: DrawingToolId[] = [
    'h-line',
    'h-ray',
    'v-line',
    'crosshair-line',
  ]

  // 双锚点工具列表
  private static readonly DOUBLE_ANCHOR_TOOLS: DrawingToolId[] = [
    'trend-line',
    'ray',
    'info-line',
    'regression-channel',
  ]

  // 三锚点工具列表
  private static readonly TRIPLE_ANCHOR_TOOLS: DrawingToolId[] = [
    'parallel-channel',
    'flat-line',
    'disjoint-channel',
  ]

  constructor(adapter: DrawingChartAdapter) {
    this.adapter = adapter
  }

  setCallbacks(callbacks: DrawingInteractionCallbacks) {
    this.callbacks = callbacks
  }

  getActiveTool(): DrawingToolId {
    return this.activeTool
  }

  setTool(toolId: DrawingToolId) {
    this.activeTool = toolId
    this.pendingAnchors = []
    this.removePreview()
    this.dragState = null
    this.setSelected(null)
    this.callbacks.onToolChange?.(toolId)
  }

  getDrawings(): DrawingObject[] {
    return this.drawings
  }

  setDrawings(drawings: DrawingObject[]) {
    this.drawings = drawings
    this.adapter.setDrawings(drawings)
  }

  clear() {
    this.pendingAnchors = []
    this.removePreview()
    this.dragState = null
    this.setSelected(null)
  }

  getSelectedDrawing(): DrawingObject | null {
    if (!this.selectedDrawingId) return null
    return this.drawings.find((d) => d.id === this.selectedDrawingId) ?? null
  }

  updateDrawingStyle(drawingId: string, style: Partial<DrawingStyle>): void {
    this.drawings = this.drawings.map((d) =>
      d.id === drawingId ? { ...d, style: { ...d.style, ...style } } : d
    )
    this.adapter.setDrawings(this.drawings)
  }

  removeDrawing(drawingId: string): void {
    this.drawings = this.drawings.filter((d) => d.id !== drawingId)
    if (this.selectedDrawingId === drawingId) {
      this.setSelected(null)
    }
    this.adapter.setDrawings(this.drawings)
  }

  /**
   * 处理指针移动事件
   * @returns 是否处理了事件（阻止冒泡）
   */
  onPointerMove(e: PointerEvent, container: HTMLElement): boolean {
    // 拖拽已有图元
    if (this.dragState) {
      return this.handleDragMove(e, container)
    }

    // 创建预览
    if (this.activeTool !== 'cursor') {
      return this.handlePreviewMove(e, container)
    }

    return false
  }

  /**
   * 处理指针按下事件
   * @returns 是否处理了事件（阻止冒泡）
   */
  onPointerDown(e: PointerEvent, container: HTMLElement): boolean {
    // 光标模式：命中检测已有图元
    if (this.activeTool === 'cursor') {
      return this.handleCursorDown(e, container)
    }

    const anchor = this.resolveAnchorFromPointer(e, container)
    if (!anchor) return false

    // 单锚点工具：点击一次立即创建
    if (DrawingInteractionController.SINGLE_ANCHOR_TOOLS.includes(this.activeTool)) {
      this.createSingleAnchorDrawing(anchor)
      return true
    }

    // 双/三锚点工具：累积锚点
    const isDouble = DrawingInteractionController.DOUBLE_ANCHOR_TOOLS.includes(this.activeTool)
    const isTriple = DrawingInteractionController.TRIPLE_ANCHOR_TOOLS.includes(this.activeTool)
    if (!isDouble && !isTriple) return false

    this.pendingAnchors.push(anchor)
    const requiredAnchors = isDouble ? 2 : 3

    if (this.pendingAnchors.length >= requiredAnchors) {
      this.createMultiAnchorDrawing(this.pendingAnchors)
      this.pendingAnchors = []
    }
    return true
  }

  /**
   * 处理指针释放事件
   * @returns 是否处理了事件（阻止冒泡）
   */
  onPointerUp(_e: PointerEvent, _container: HTMLElement): boolean {
    if (!this.dragState) return false
    this.dragState = null
    return true
  }

  // ============ 光标模式：命中检测与拖拽 ============

  private handleCursorDown(e: PointerEvent, container: HTMLElement): boolean {
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const hit = this.hitTest(mouseX, mouseY)
    if (!hit) {
      this.setSelected(null)
      return false
    }

    this.setSelected(hit.drawing)

    this.dragState = {
      drawingId: hit.drawing.id,
      anchorIndex: 'anchorIndex' in hit ? hit.anchorIndex : undefined,
      snapshot: hit.drawing.anchors.map((a) => ({ ...a })),
      startMouse: { x: mouseX, y: mouseY },
    }
    return true
  }

  private handleDragMove(e: PointerEvent, container: HTMLElement): boolean {
    if (!this.dragState) return false

    const drawing = this.drawings.find((d) => d.id === this.dragState!.drawingId)
    if (!drawing) {
      this.dragState = null
      return false
    }

    const newAnchor = this.resolveAnchorFromPointer(e, container)

    if (this.dragState.anchorIndex !== undefined) {
      // 拖拽单个锚点
      if (newAnchor) {
        const idx = this.dragState.anchorIndex
        drawing.anchors[idx] = {
          ...drawing.anchors[idx]!,
          index: newAnchor.index,
          time: newAnchor.time,
          price: newAnchor.price,
        }
        // flat-line：第三个锚点的 index/time 始终跟随第二个锚点
        if (drawing.kind === 'flat-line' && idx === 1 && drawing.anchors.length >= 3) {
          drawing.anchors[2] = {
            ...drawing.anchors[2]!,
            index: newAnchor.index,
            time: newAnchor.time,
          }
        }
      }
    } else {
      // 拖拽整条线：基于鼠标偏移量移动所有锚点
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const dx = mouseX - this.dragState.startMouse.x
      const dy = mouseY - this.dragState.startMouse.y

      for (let i = 0; i < drawing.anchors.length; i++) {
        const snap = this.dragState.snapshot[i]!
        const snapScreen = this.anchorToScreen(snap)
        if (!snapScreen) continue

        const targetX = snapScreen.x + dx
        const targetY = snapScreen.y + dy
        const newFromScreen = this.screenToAnchor(targetX, targetY)
        if (newFromScreen) {
          drawing.anchors[i] = {
            ...drawing.anchors[i]!,
            index: newFromScreen.index,
            time: newFromScreen.time,
            price: newFromScreen.price,
          }
        }
      }
    }

    this.adapter.setDrawings([...this.drawings])
    return true
  }

  // ============ 预览模式 ============

  private handlePreviewMove(e: PointerEvent, container: HTMLElement): boolean {
    const anchor = this.resolveAnchorFromPointer(e, container)
    if (!anchor) {
      this.removePreview()
      return false
    }

    const isSingle = DrawingInteractionController.SINGLE_ANCHOR_TOOLS.includes(this.activeTool)
    const isDouble = DrawingInteractionController.DOUBLE_ANCHOR_TOOLS.includes(this.activeTool)
    const isTriple = DrawingInteractionController.TRIPLE_ANCHOR_TOOLS.includes(this.activeTool)
    if (!isSingle && !isDouble && !isTriple) return false

    let preview: DrawingObject

    if (isSingle) {
      preview = {
        id: this.previewDrawingId,
        kind: this.getDrawingKind(this.activeTool),
        paneId: 'main',
        visible: true,
        anchors: [{ id: `${this.previewDrawingId}-a`, index: anchor.index, time: anchor.time, price: anchor.price }],
        params: {},
        style: {
          stroke: '#2962ff',
          strokeWidth: 1,
          strokeStyle: 'dashed',
        },
      }
    } else if (isDouble && this.pendingAnchors.length >= 1) {
      preview = {
        id: this.previewDrawingId,
        kind: this.getDrawingKind(this.activeTool),
        paneId: 'main',
        visible: true,
        anchors: [
          { id: `${this.previewDrawingId}-a`, index: this.pendingAnchors[0]!.index, time: this.pendingAnchors[0]!.time, price: this.pendingAnchors[0]!.price },
          { id: `${this.previewDrawingId}-b`, index: anchor.index, time: anchor.time, price: anchor.price },
        ],
        params: this.activeTool === 'regression-channel' ? { sigma: 2 } : {},
        style: {
          stroke: '#2962ff',
          strokeWidth: 1,
          strokeStyle: 'dashed',
          ...(this.activeTool === 'regression-channel' ? { fillOpacity: 0.1 } : {}),
        },
      }
    } else if (isTriple) {
      if (this.pendingAnchors.length === 0) return false

      if (this.pendingAnchors.length === 1) {
        // 修复：用 trend-line 渲染线段预览（2 个锚点），三锚点工具的 definition 需要 3 个锚点才能渲染
        preview = {
          id: this.previewDrawingId,
          kind: 'trend-line',
          paneId: 'main',
          visible: true,
          anchors: [
            { id: `${this.previewDrawingId}-a`, index: this.pendingAnchors[0]!.index, time: this.pendingAnchors[0]!.time, price: this.pendingAnchors[0]!.price },
            { id: `${this.previewDrawingId}-b`, index: anchor.index, time: anchor.time, price: anchor.price },
          ],
          params: {},
          style: {
            stroke: '#2962ff',
            strokeWidth: 1,
            strokeStyle: 'dashed',
          },
        }
      } else {
        const thirdAnchor = this.activeTool === 'flat-line'
          ? {
              id: `${this.previewDrawingId}-c`,
              index: this.pendingAnchors[1]!.index,
              time: this.pendingAnchors[1]!.time,
              price: anchor.price,
            }
          : {
              id: `${this.previewDrawingId}-c`,
              index: anchor.index,
              time: anchor.time,
              price: anchor.price,
            }

        preview = {
          id: this.previewDrawingId,
          kind: this.getDrawingKind(this.activeTool),
          paneId: 'main',
          visible: true,
          anchors: [
            { id: `${this.previewDrawingId}-a`, index: this.pendingAnchors[0]!.index, time: this.pendingAnchors[0]!.time, price: this.pendingAnchors[0]!.price },
            { id: `${this.previewDrawingId}-b`, index: this.pendingAnchors[1]!.index, time: this.pendingAnchors[1]!.time, price: this.pendingAnchors[1]!.price },
            thirdAnchor,
          ],
          params: {},
          style: {
            stroke: '#2962ff',
            strokeWidth: 1,
            strokeStyle: 'dashed',
            fillOpacity: 0.1,
          },
        }
      }
    } else {
      return false
    }

    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)
    this.drawings = [...this.drawings, preview]
    this.adapter.setDrawings(this.drawings)
    return true
  }

  // ============ 命中检测 ============

  private hitTest(mouseX: number, mouseY: number): HitResult | null {
    const drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId && d.visible)
    const regressionGeometryCache = new Map<string, RegressionChannelGeometry | null>()

    // 锚点优先
    for (const drawing of drawings) {
      // regression-channel：回归线端点也是可拖拽区域
      if (drawing.kind === 'regression-channel' && drawing.anchors.length >= 2) {
        const hit = this.hitTestRegressionEndpoints(drawing, mouseX, mouseY, regressionGeometryCache)
        if (hit) return hit
      }

      for (let i = 0; i < drawing.anchors.length; i++) {
        const screen = this.anchorToScreen(drawing.anchors[i]!)
        if (!screen) continue
        const dist = Math.hypot(mouseX - screen.x, mouseY - screen.y)
        if (dist <= ANCHOR_HIT_RADIUS) {
          return { drawing, anchorIndex: i }
        }
      }
    }

    // 线条其次
    for (const drawing of drawings) {
      const segments = this.getDrawingLineSegments(drawing, regressionGeometryCache)
      for (const seg of segments) {
        const dist = pointToSegmentDist(mouseX, mouseY, seg.a, seg.b)
        if (dist <= LINE_HIT_RADIUS) {
          return { drawing }
        }
      }
    }

    return null
  }

  private getDrawingLineSegments(
    drawing: DrawingObject,
    regressionGeometryCache?: Map<string, RegressionChannelGeometry | null>,
  ): LineSegment[] {
    const viewport = this.adapter.getViewport()
    if (!viewport) return []

    if (drawing.kind === 'regression-channel') {
      return this.getRegressionChannelGeometry(drawing, regressionGeometryCache)?.segments ?? []
    }

    // 单锚点图元：根据 kind 构造屏幕线段
    if (drawing.anchors.length === 1) {
      const screen = this.anchorToScreen(drawing.anchors[0]!)
      if (!screen) return []

      const paneInfo = this.adapter.getPaneInfo('main')
      if (!paneInfo) return []

      const right = viewport.plotWidth
      const bottom = paneInfo.height

      switch (drawing.kind) {
        case 'horizontal-line':
          return [{ a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } }]
        case 'horizontal-ray':
          return [{ a: screen, b: { x: right, y: screen.y } }]
        case 'vertical-line':
          return [{ a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } }]
        case 'cross-line':
          return [
            { a: { x: 0, y: screen.y }, b: { x: right, y: screen.y } },
            { a: { x: screen.x, y: 0 }, b: { x: screen.x, y: bottom } },
          ]
        default:
          return []
      }
    }

    // 多锚点图元：按 kind 特殊处理
    const points = drawing.anchors.map((a) => this.anchorToScreen(a)).filter(Boolean) as { x: number; y: number }[]
    if (points.length < 2) return []

    const segments: LineSegment[] = []

    if (points.length === 2) {
      const a = points[0]!
      const b = points[1]!

      // 其他双锚点工具：标准线段
      const dx = b.x - a.x
      const dy = b.y - a.y

      let start = a
      let end = b

      const extend = this.getExtendMode(drawing)
      const maxLen = Math.max(viewport.plotWidth, viewport.plotHeight) * 4

      if (extend === 'right' || extend === 'both') {
        end = { x: b.x + dx * maxLen, y: b.y + dy * maxLen }
      }
      if (extend === 'left' || extend === 'both') {
        start = { x: a.x - dx * maxLen, y: a.y - dy * maxLen }
      }

      segments.push({ a: start, b: end })
    } else if (points.length >= 3) {
      switch (drawing.kind) {
        case 'parallel-channel': {
          const [p1, p2, p3] = points as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const p4 = { x: p3.x + dx, y: p3.y + dy }
          segments.push(
            { a: p1, b: p2 },
            { a: p3, b: p4 },
          )
          break
        }
        case 'flat-line': {
          const [p1, p2, p3] = points as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
          const h1 = { x: p1.x, y: p3.y }
          const h2 = { x: p2.x, y: p3.y }
          segments.push({ a: p1, b: p2 })
          segments.push({ a: h1, b: h2 })
          break
        }
        case 'disjoint-channel': {
          const [p1, p2, p3] = points as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const p4 = { x: p3.x + dx, y: p3.y - dy }
          segments.push({ a: p1, b: p2 })
          segments.push({ a: p3, b: p4 })
          break
        }
        default:
          for (let i = 0; i < points.length - 1; i++) {
            segments.push({ a: points[i]!, b: points[i + 1]! })
          }
      }
    }

    return segments
  }


  /**
   * regression-channel 专用：回归线端点也是可拖拽的锚点区域
   * 回归线端点可能远离存储的锚点，需要额外检测
   */
  private hitTestRegressionEndpoints(
    drawing: DrawingObject,
    mouseX: number,
    mouseY: number,
    regressionGeometryCache?: Map<string, RegressionChannelGeometry | null>,
  ): { drawing: DrawingObject; anchorIndex: number } | null {
    const geometry = this.getRegressionChannelGeometry(drawing, regressionGeometryCache)
    if (!geometry) return null

    for (const endpoint of geometry.endpoints) {
      const dist = Math.hypot(mouseX - endpoint.point.x, mouseY - endpoint.point.y)
      if (dist <= ANCHOR_HIT_RADIUS) {
        return { drawing, anchorIndex: endpoint.anchorIndex }
      }
    }

    return null
  }


  private getRegressionChannelGeometry(
    drawing: DrawingObject,
    regressionGeometryCache?: Map<string, RegressionChannelGeometry | null>,
  ): RegressionChannelGeometry | null {
    const cached = regressionGeometryCache?.get(drawing.id)
    if (cached !== undefined) return cached

    const data = this.adapter.getData()
    if (data.length === 0 || drawing.anchors.length < 2) {
      regressionGeometryCache?.set(drawing.id, null)
      return null
    }

    const firstIndex = Math.round(drawing.anchors[0]!.index)
    const secondIndex = Math.round(drawing.anchors[1]!.index)
    const clampedFirst = Math.min(Math.max(firstIndex, 0), data.length - 1)
    const clampedSecond = Math.min(Math.max(secondIndex, 0), data.length - 1)
    const startIndex = Math.min(clampedFirst, clampedSecond)
    const endIndex = Math.max(clampedFirst, clampedSecond)
    const slice = data.slice(startIndex, endIndex + 1)
    const regression = computeLinearRegression(slice.map((item: { close: number }) => item.close))
    if (!regression) {
      regressionGeometryCache?.set(drawing.id, null)
      return null
    }

    const sigma = (drawing.params as { sigma?: number } | undefined)?.sigma ?? 2
    const offset = regression.stdDev * sigma
    const firstValue = regression.intercept
    const lastValue = regression.intercept + regression.slope * (slice.length - 1)

    const middleStart = this.anchorToScreen({ id: '', index: firstIndex, price: firstValue })
    const middleEnd = this.anchorToScreen({ id: '', index: secondIndex, price: lastValue })
    const upperStart = this.anchorToScreen({ id: '', index: firstIndex, price: firstValue + offset })
    const upperEnd = this.anchorToScreen({ id: '', index: secondIndex, price: lastValue + offset })
    const lowerStart = this.anchorToScreen({ id: '', index: firstIndex, price: firstValue - offset })
    const lowerEnd = this.anchorToScreen({ id: '', index: secondIndex, price: lastValue - offset })

    const segments: LineSegment[] = []
    if (middleStart && middleEnd) segments.push({ a: middleStart, b: middleEnd })
    if (upperStart && upperEnd) segments.push({ a: upperStart, b: upperEnd })
    if (lowerStart && lowerEnd) segments.push({ a: lowerStart, b: lowerEnd })

    const endpoints: RegressionChannelGeometry['endpoints'] = []
    if (middleStart) endpoints.push({ point: middleStart, anchorIndex: 0 })
    if (middleEnd) endpoints.push({ point: middleEnd, anchorIndex: 1 })
    if (upperStart) endpoints.push({ point: upperStart, anchorIndex: 0 })
    if (upperEnd) endpoints.push({ point: upperEnd, anchorIndex: 1 })
    if (lowerStart) endpoints.push({ point: lowerStart, anchorIndex: 0 })
    if (lowerEnd) endpoints.push({ point: lowerEnd, anchorIndex: 1 })

    const geometry = { segments, endpoints }
    regressionGeometryCache?.set(drawing.id, geometry)
    return geometry
  }

  private getExtendMode(drawing: DrawingObject): 'none' | 'left' | 'right' | 'both' {
    switch (drawing.kind) {
      case 'ray':
        return 'right'
      case 'extended-line':
        return 'both'
      default:
        return 'none'
    }
  }

  // ============ 坐标转换 ============

  private anchorToScreen(anchor: DrawingAnchor): { x: number; y: number } | null {
    const viewport = this.adapter.getViewport()
    if (!viewport) return null

    const { kWidth, kGap } = this.adapter.getKWidthKGap()
    const dpr = this.adapter.getCurrentDpr()
    const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
    if (!Number.isFinite(anchor.index)) return null

    const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft

    const y = this.adapter.priceToY('main', anchor.price)
    return { x, y }
  }

  private screenToAnchor(
    screenX: number,
    screenY: number
  ): DrawingAnchorInput | null {
    const data = this.adapter.getData()
    const viewport = this.adapter.getViewport()
    if (!viewport || data.length === 0) return null

    const logicalIndex = this.adapter.getLogicalIndexAtX(screenX)
    if (logicalIndex === null) return null

    const paneInfo = this.adapter.getPaneInfo('main')
    if (!paneInfo) return null

    const timestamp = this.adapter.getTimestampAtLogicalIndex(logicalIndex) ?? undefined

    return {
      index: logicalIndex,
      time: timestamp ?? undefined,
      price: this.adapter.yToPrice('main', screenY - paneInfo.top),
    }
  }

  // ============ 工具方法 ============

  private setSelected(drawing: DrawingObject | null) {
    const newId = drawing?.id ?? null
    if (this.selectedDrawingId === newId) return
    this.selectedDrawingId = newId
    this.adapter.setSelectedDrawingId(newId)
    this.callbacks.onDrawingSelected?.(drawing)
  }

  private removePreview() {
    if (!this.drawings.some((d) => d.id === this.previewDrawingId)) return
    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)
    this.adapter.setDrawings(this.drawings)
  }

  private resolveAnchorFromPointer(
    e: PointerEvent,
    container: HTMLElement
  ): DrawingAnchorInput | null {
    const data = this.adapter.getData()
    const viewport = this.adapter.getViewport()
    if (!viewport || data.length === 0) return null

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    if (mouseX < 0 || mouseY < 0 || mouseX > viewport.plotWidth || mouseY > viewport.plotHeight) {
      return null
    }

    const paneInfo = this.adapter.getPaneInfo('main')
    if (!paneInfo) return null
    if (mouseY < paneInfo.top || mouseY > paneInfo.top + paneInfo.height) return null

    const logicalIndex = this.adapter.getLogicalIndexAtX(mouseX)
    if (logicalIndex === null) return null
    const timestamp = this.adapter.getTimestampAtLogicalIndex(logicalIndex) ?? undefined

    return {
      index: logicalIndex,
      time: timestamp ?? undefined,
      price: this.adapter.yToPrice('main', mouseY - paneInfo.top),
    }
  }

  private createSingleAnchorDrawing(anchor: DrawingAnchorInput) {
    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)

    const drawing: DrawingObject = {
      id: `drawing-${Date.now()}`,
      kind: this.getDrawingKind(this.activeTool),
      paneId: 'main',
      visible: true,
      anchors: [{ id: `${Date.now()}-a`, index: anchor.index, time: anchor.time, price: anchor.price }],
      params: {},
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'solid',
      },
    }

    this.drawings = [...this.drawings, drawing]
    this.adapter.setDrawings(this.drawings)
    this.callbacks.onDrawingCreated?.(drawing)
    this.activeTool = 'cursor'
    this.callbacks.onToolChange?.('cursor')
  }

  private createMultiAnchorDrawing(anchors: DrawingAnchorInput[]) {
    this.drawings = this.drawings.filter((d) => d.id !== this.previewDrawingId)

    const kind = this.getDrawingKind(this.activeTool)
    const params: Record<string, unknown> = kind === 'regression-channel' ? { sigma: 2 } : {}

    const normalizedAnchors = kind === 'flat-line' && anchors.length >= 3
      ? [
          anchors[0]!,
          anchors[1]!,
          {
            index: anchors[1]!.index,
            time: anchors[1]!.time,
            price: anchors[2]!.price,
          },
        ]
      : anchors

    const isChannel = ['parallel-channel', 'regression-channel', 'flat-line', 'disjoint-channel'].includes(kind)

    const drawing: DrawingObject = {
      id: `drawing-${Date.now()}`,
      kind,
      paneId: 'main',
      visible: true,
      anchors: normalizedAnchors.map((a, i) => ({
        id: `${Date.now()}-${String.fromCharCode(97 + i)}`,
        index: a.index,
        time: a.time,
        price: a.price,
      })),
      params,
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'solid',
        ...(isChannel ? { fillOpacity: 0.1 } : {}),
      },
    }

    this.drawings = [...this.drawings, drawing]
    this.adapter.setDrawings(this.drawings)
    this.callbacks.onDrawingCreated?.(drawing)
    this.activeTool = 'cursor'
    this.callbacks.onToolChange?.('cursor')
  }

  private getDrawingKind(toolId: DrawingToolId): DrawingKind {
    switch (toolId) {
      case 'cursor':
        throw new Error('cursor is not a drawing kind')
      case 'h-line':
        return 'horizontal-line'
      case 'h-ray':
        return 'horizontal-ray'
      case 'v-line':
        return 'vertical-line'
      case 'crosshair-line':
        return 'cross-line'
      default:
        return toolId
    }
  }
}

function pointToSegmentDist(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y)

  let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}
