// 交互控制中心

import type { Chart } from '../chart'
import type { MarkerEntity, CustomMarkerEntity } from '../marker/registry'
import { MarkerInteractionState } from './markerInteraction'
import { PinchTracker } from './pinchTracker'
import { computeTooltipPosition } from './tooltipPosition'
import { UpdateLevel } from '../layout/pane'
import type { ChartSettings } from '../../config/chartSettings'

interface PointerLocation {
    mouseX: number
    mouseY: number
}

export interface InteractionSnapshot {
    crosshairPos: { x: number; y: number } | null
    crosshairIndex: number | null
    crosshairPrice: number | null
    hoveredIndex: number | null
    activePaneId: string | null
    tooltipPos: { x: number; y: number }
    tooltipAnchorPlacement: 'right-bottom' | 'left-bottom'
    hoveredMarkerData: MarkerEntity | null
    hoveredCustomMarker: CustomMarkerEntity | null
    isDragging: boolean
    isResizingPaneBoundary: boolean
    isHoveringPaneBoundary: boolean
    hoveredPaneBoundaryId: string | null
    isHoveringRightAxis: boolean
}

/**
 * 交互控制器，处理拖拽滚动、缩放、十字线 hover 等交互逻辑
 */
export class InteractionController {
    private chart: Chart
    private isDragging = false
    private dragMode: 'none' | 'pan' | 'resize-separator' | 'scale-price' = 'none'
    private dragStartX = 0
    private scrollStartX = 0

    private applyPanScroll(container: HTMLDivElement, nextScrollLeft: number) {
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
        const clampedScrollLeft = Math.min(Math.max(0, nextScrollLeft), maxScrollLeft)
        const dpr = this.chart.getCurrentDpr()
        const rounded = Math.round(clampedScrollLeft * dpr) / dpr
        container.scrollLeft = rounded
    }

    /** 垂直拖动相关 */
    private dragStartY = 0
    private activePaneIdOnDrag: string | null = null

    /** 分隔线拖拽相关 */
    private activeSeparatorUpperPaneId: string | null = null
    private hoveredSeparatorUpperPaneId: string | null = null

    /** 右轴悬浮相关 */
    private hoveredRightAxisPaneId: string | null = null

    /** [触屏]:触摸会话标记，避免触摸触发的模拟 mouse 事件干扰 */
    private isTouchSession = false

    private pinchTracker = new PinchTracker()

    /** 十字线位置 */
    crosshairPos: { x: number; y: number } | null = null
    /** 十字线当前指向的 K 线索引 */
    crosshairIndex: number | null = null
    /** 十字线指向的价格（用于价格轴平移时跟随） */
    crosshairPrice: number | null = null
    /** 鼠标悬停的 K 线索引（命中 candle 时有效） */
    hoveredIndex: number | null = null
    /** 当前活跃的 pane ID */
    activePaneId: string | null = null
    /** tooltip 位置 */
    tooltipPos: { x: number; y: number } = { x: 0, y: 0 }
    /** tooltip 尺寸 */
    tooltipSize: { width: number; height: number } = { width: 220, height: 180 }
    /** tooltip 锚定位放置方向 */
    tooltipAnchorPlacement: 'right-bottom' | 'left-bottom' = 'right-bottom'
    /** 是否使用 CSS 锚定位 */
    private useTooltipAnchorPositioning = false
    /** 统一交互状态变更回调 */
    private onInteractionChangeCallback?: (snapshot: InteractionSnapshot) => void
    /** 用户设置 */
    private settings: ChartSettings = {}

    private markerState = new MarkerInteractionState()

    /** 当前帧的 K 线起始 x 坐标数组 */
    private kLinePositions: number[] | null = null
    /** 当前帧的可见 K 线索引范围 */
    private visibleRange: { start: number; end: number } | null = null

    /** hover 去重快照 */
    private lastHoverRenderKey = ''

    /** K 线宽度（物理像素），用于计算 K 线中心偏移 */
    private kWidthPx: number | null = null

    constructor(chart: Chart) {
        this.chart = chart
        this.setupPinchZoom()
    }

    private setupPinchZoom(): void {
        this.pinchTracker.setOnPinchZoom((delta, centerClientX) => {
            const container = this.chart.getDom().container
            if (!container) return
            const rect = container.getBoundingClientRect()
            const centerX = centerClientX - rect.left
            this.chart.handlePinchZoom(delta, centerX)
        })
    }

    /** 更新用户设置 */
    updateSettings(settings: ChartSettings): void {
        const prev = this.settings.disableMainPaneVerticalScroll
        this.settings = { ...settings }
        // 开启自适应时，重置主图垂直偏移
        if (!prev && this.settings.disableMainPaneVerticalScroll) {
            this.chart.resetPriceOffset('main')
        }
    }

    getInteractionSnapshot(): InteractionSnapshot {
        return {
            crosshairPos: this.crosshairPos ? { ...this.crosshairPos } : null,
            crosshairIndex: this.crosshairIndex,
            crosshairPrice: this.crosshairPrice,
            hoveredIndex: this.hoveredIndex,
            activePaneId: this.activePaneId,
            tooltipPos: { ...this.tooltipPos },
            tooltipAnchorPlacement: this.tooltipAnchorPlacement,
            hoveredMarkerData: this.markerState.hoveredMarkerData,
            hoveredCustomMarker: this.markerState.hoveredCustomMarker,
            isDragging: this.isDragging,
            isResizingPaneBoundary: this.dragMode === 'resize-separator',
            isHoveringPaneBoundary: this.hoveredSeparatorUpperPaneId !== null,
            hoveredPaneBoundaryId: this.hoveredSeparatorUpperPaneId,
            isHoveringRightAxis: this.hoveredRightAxisPaneId !== null,
        }
    }

    setOnInteractionChange(callback: (snapshot: InteractionSnapshot) => void) {
        this.onInteractionChangeCallback = callback
    }

    private notifyInteractionChange() {
        this.onInteractionChangeCallback?.(this.getInteractionSnapshot())
    }

    private getHoverRenderKey(): string {
        const crosshairX = this.crosshairPos ? Math.round(this.crosshairPos.x * this.chart.getCurrentDpr()) : 'n'
        const crosshairY = this.crosshairPos ? Math.round(this.crosshairPos.y * this.chart.getCurrentDpr()) : 'n'
        return [
            this.crosshairIndex ?? 'n',
            this.hoveredIndex ?? 'n',
            this.activePaneId ?? 'n',
            this.hoveredRightAxisPaneId ?? 'n',
            this.hoveredSeparatorUpperPaneId ?? 'n',
            this.markerState.hoveredMarkerId ?? 'n',
            this.markerState.hoveredCustomMarker?.id ?? 'n',
            crosshairX,
            crosshairY,
        ].join('|')
    }

    /**
     * [触屏]:处理 Pointer 按下事件
     * @param e PointerEvent
     */
    onPointerDown(e: PointerEvent) {
        this.isTouchSession = e.pointerType === 'touch'
        if (this.pinchTracker.handlePointerDown(e, this.isTouchSession)) {
            this.isDragging = false
            this.dragMode = 'none'
            return
        }

        // 单指操作（需要是主指针且不在捏合中，且不是捏合后的残余手指）
        if (e.isPrimary === false || this.pinchTracker.getIsPinching()) return
        if (this.pinchTracker.getPointerCount() > 1) return

        const location = this.getPlotPointerLocation(e.clientX, e.clientY)
        if (!location) return

        const { mouseX, mouseY } = location
        const scrollLeft = this.chart.getCachedScrollLeft()

        const markerManager = this.chart.getMarkerManager()
        const worldX = scrollLeft + mouseX
        const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

        if (hitMarker) {
            this.markerState.handleClick(hitMarker)
            return
        }

        const separatorUpperPaneId = this.hitTestPaneSeparator(mouseY)
        if (separatorUpperPaneId) {
            this.isDragging = true
            this.dragMode = 'resize-separator'
            this.dragStartY = e.clientY
            this.activeSeparatorUpperPaneId = separatorUpperPaneId
            this.hoveredSeparatorUpperPaneId = separatorUpperPaneId
            this.clearHover()
            this.chart.scheduleDraw()
            return
        }

        const pane = this.getPaneByY(mouseY)
        this.isDragging = true
        this.dragMode = 'pan'
        this.updatePlotHoverFromPoint(e.clientX, e.clientY)
        this.dragStartX = e.clientX
        this.dragStartY = e.clientY
        this.scrollStartX = this.chart.getCachedScrollLeft()
        this.activePaneIdOnDrag = pane?.id || null

        this.chart.scheduleDraw()
    }



    /**
     * 设置 tooltip 尺寸
     * @param size 宽高对象
     */
    setTooltipSize(size: { width: number; height: number }) {
        this.tooltipSize = size
    }

    setTooltipAnchorPositioning(enabled: boolean) {
        this.useTooltipAnchorPositioning = enabled
    }

    /**
     * 处理 Pointer 抬起事件
     * @param e PointerEvent
     */
    onPointerUp(e: PointerEvent) {
        this.pinchTracker.handlePointerUp(e)

        if (e.isPrimary === false) return
        this.isDragging = false
        this.dragMode = 'none'
        this.activePaneIdOnDrag = null
        this.activeSeparatorUpperPaneId = null
        this.notifyInteractionChange()
    }

    /**
     * 处理 Pointer 离开事件
     * @param e PointerEvent
     */
    onPointerLeave(e: PointerEvent) {
        this.pinchTracker.handlePointerLeave(e)

        if (e.isPrimary === false) return

        this.isDragging = false
        this.dragMode = 'none'
        this.activePaneIdOnDrag = null
        this.clearSeparatorState()
        this.isTouchSession = false
        this.clearHover()
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }

    /** 处理滚动事件 */
    onScroll() {
        this.kLinePositions = null
        this.visibleRange = null
        this.clearHover()
        this.chart.scheduleDraw()
        this.notifyInteractionChange()
    }

    /**
     * 处理 Pointer 移动事件（支持鼠标和触屏）
     * @param e PointerEvent
     */
    onPointerMove(e: PointerEvent) {
        if (this.pinchTracker.handlePointerMove(e)) return

        if (!e.isPrimary) return

        if (e.pointerType === 'touch') {
            this.isTouchSession = true
        }

        const container = this.chart.getDom().container

        if (this.isDragging) {
            if (this.dragMode === 'resize-separator') {
                const deltaY = e.clientY - this.dragStartY
                if (deltaY !== 0 && this.activeSeparatorUpperPaneId) {
                    const resized = this.chart.resizePaneBoundary(this.activeSeparatorUpperPaneId, deltaY)
                    if (resized) {
                        this.dragStartY = e.clientY
                    }
                }
                return
            }

            if (this.dragMode === 'scale-price') {
                const deltaY = e.clientY - this.dragStartY
                if (deltaY !== 0 && this.activePaneIdOnDrag) {
                    this.chart.scalePrice(this.activePaneIdOnDrag, deltaY)
                    this.dragStartY = e.clientY
                }
                return
            }

            if (this.dragMode === 'pan') {
                const deltaX = this.dragStartX - e.clientX
                this.applyPanScroll(container, this.scrollStartX + deltaX)

                const deltaY = e.clientY - this.dragStartY
                this.dragStartY = e.clientY
                if (deltaY !== 0 && this.activePaneIdOnDrag === 'main') {
                    if (!this.settings.disableMainPaneVerticalScroll) {
                        this.chart.translatePrice(this.activePaneIdOnDrag, deltaY)
                    }
                }
            }
            return
        }

        const location = this.getPlotPointerLocation(e.clientX, e.clientY)
        if (!location) return
        this.hoveredSeparatorUpperPaneId = this.hitTestPaneSeparator(location.mouseY)

        this.updatePlotHoverFromPoint(e.clientX, e.clientY)
        const hoverRenderKey = this.getHoverRenderKey()
        if (hoverRenderKey !== this.lastHoverRenderKey) {
            this.lastHoverRenderKey = hoverRenderKey
            this.chart.scheduleDraw(UpdateLevel.Overlay)
        }
        this.notifyInteractionChange()
    }


    /**
     * 设置当前帧的 K 线起始 x 坐标数组和可见范围
     * @param positions K 线起始 x 坐标数组
     * @param visibleRange 可见 K 线索引范围
     * @param kWidthPx K 线宽度（物理像素）
     */
    setKLinePositions(
        positions: number[] | null,
        visibleRange: { start: number; end: number } | null,
        kWidthPx?: number
    ) {
        this.kLinePositions = positions
        this.visibleRange = visibleRange
        if (kWidthPx !== undefined) {
            this.kWidthPx = kWidthPx
        }
    }

    onRightAxisPointerDown(e: PointerEvent) {
        if (e.isPrimary === false) return
        this.isTouchSession = e.pointerType === 'touch'
        const location = this.getRightAxisPointerLocation(e.clientX, e.clientY)
        if (!location) return
        if (this.beginScalePriceDrag(e.clientY, location.mouseY)) {
            this.chart.scheduleDraw()
            this.notifyInteractionChange()
        }
    }

    onRightAxisPointerMove(e: PointerEvent) {
        if (!e.isPrimary) return
        if (e.pointerType === 'touch') {
            this.isTouchSession = true
        }

        if (this.isDragging && this.dragMode === 'scale-price') {
            const deltaY = e.clientY - this.dragStartY
            if (deltaY !== 0 && this.activePaneIdOnDrag) {
                this.chart.scalePrice(this.activePaneIdOnDrag, deltaY)
                this.dragStartY = e.clientY
            }
            return
        }

        this.updateRightAxisHoverFromPoint(e.clientX, e.clientY)
        const hoverRenderKey = this.getHoverRenderKey()
        if (hoverRenderKey !== this.lastHoverRenderKey) {
            this.lastHoverRenderKey = hoverRenderKey
            this.chart.scheduleDraw(UpdateLevel.Overlay)
        }
        this.notifyInteractionChange()
    }

    onRightAxisPointerUp(e: PointerEvent) {
        this.onPointerUp(e)
    }

    onRightAxisPointerLeave(e: PointerEvent) {
        if (e.isPrimary === false) return
        if (this.isDragging && this.dragMode === 'scale-price') return
        this.hoveredRightAxisPaneId = null
        this.notifyInteractionChange()
    }

    /** 检查是否正在拖拽 */
    isDraggingState(): boolean {
        return this.isDragging
    }

    setOnMarkerHover(callback: (marker: MarkerEntity | null) => void) {
        this.markerState.setOnMarkerHover(callback)
    }

    setOnMarkerClick(callback: (marker: MarkerEntity) => void) {
        this.markerState.setOnMarkerClick(callback)
    }

    setOnCustomMarkerHover(callback: (marker: CustomMarkerEntity | null) => void) {
        this.markerState.setOnCustomMarkerHover(callback)
    }

    setOnCustomMarkerClick(callback: (marker: CustomMarkerEntity) => void) {
        this.markerState.setOnCustomMarkerClick(callback)
    }

    /** 命中可拖拽分隔线（返回上方 paneId） */
    private hitTestPaneSeparator(mouseY: number): string | null {
        const paneRenderers = this.chart.getPaneRenderers()
        if (paneRenderers.length < 2) return null

        const SEP_HIT_HALF = 5
        for (let i = 0; i < paneRenderers.length - 1; i++) {
            const upper = paneRenderers[i]?.getPane()
            const lower = paneRenderers[i + 1]?.getPane()
            if (!upper || !lower) continue
            const boundaryY = upper.top + upper.height
            if (Math.abs(mouseY - boundaryY) <= SEP_HIT_HALF) {
                return upper.id
            }
        }
        return null
    }

    private getPaneByY(mouseY: number) {
        const paneRenderers = this.chart.getPaneRenderers()
        const renderer = paneRenderers.find((r) => {
            const pane = r.getPane()
            return mouseY >= pane.top && mouseY <= pane.top + pane.height
        })
        return renderer?.getPane() || null
    }

    private getPlotPointerLocation(clientX: number, clientY: number): PointerLocation | null {
        const container = this.chart.getDom().container
        const rect = container.getBoundingClientRect()
        const mouseX = clientX - rect.left
        const mouseY = clientY - rect.top
        return { mouseX, mouseY }
    }

    private getRightAxisPointerLocation(clientX: number, clientY: number): PointerLocation {
        const rightAxisLayer = this.chart.getDom().rightAxisLayer
        const rect = rightAxisLayer.getBoundingClientRect()
        const mouseX = clientX - rect.left
        const mouseY = clientY - rect.top
        return { mouseX, mouseY }
    }

    private beginScalePriceDrag(clientY: number, mouseY: number) {
        const pane = this.getPaneByY(mouseY)
        if (!pane) return false
        // 主图禁用垂直滚动时，禁止价格轴缩放
        if (pane.id === 'main' && this.settings.disableMainPaneVerticalScroll) {
            return false
        }
        this.isDragging = true
        this.dragMode = 'scale-price'
        this.dragStartY = clientY
        this.activePaneIdOnDrag = pane.id
        this.hoveredRightAxisPaneId = pane.id
        this.hoveredSeparatorUpperPaneId = null
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = pane.id
        return true
    }

    clearHover() {
        this.lastHoverRenderKey = ''
        this.hoveredRightAxisPaneId = null
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = null

        this.markerState.clearAll(this.chart.getMarkerManager())
    }


    private clearSeparatorState() {
        this.activeSeparatorUpperPaneId = null
        this.hoveredSeparatorUpperPaneId = null
        this.hoveredRightAxisPaneId = null
    }

    /**
     * 从屏幕坐标更新 hover 状态
     * @param clientX 屏幕 x 坐标
     * @param clientY 屏幕 y 坐标
     */

    private updateRightAxisHoverFromPoint(clientX: number, clientY: number) {
        const location = this.getRightAxisPointerLocation(clientX, clientY)
        if (!location) return

        const { mouseY } = location
        const viewport = this.chart.getViewport()
        const plotHeight = viewport?.plotHeight ?? Math.max(1, Math.round(this.chart.getDom().container.clientHeight))
        if (mouseY < 0 || mouseY > plotHeight) {
            this.hoveredRightAxisPaneId = null
            return
        }

        const pane = this.getPaneByY(mouseY)
        this.hoveredRightAxisPaneId = pane?.id || null
        this.hoveredSeparatorUpperPaneId = null
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = pane?.id || null
    }

    private updatePlotHoverFromPoint(clientX: number, clientY: number) {
        const location = this.getPlotPointerLocation(clientX, clientY)
        if (!location) return

        const { mouseX, mouseY } = location
        const container = this.chart.getDom().container
        const viewport = this.chart.getViewport()
        const viewWidth = viewport?.viewWidth ?? Math.max(1, Math.round(container.clientWidth))
        const viewHeight = viewport?.viewHeight ?? Math.max(1, Math.round(container.clientHeight))
        const plotWidth = viewport?.plotWidth ?? viewWidth
        const plotHeight = viewport?.plotHeight ?? viewHeight
        if (mouseX < 0 || mouseY < 0 || mouseX > plotWidth || mouseY > plotHeight) {
            this.clearHover()
            return
        }

        this.hoveredRightAxisPaneId = null

        const scrollLeft = this.chart.getCachedScrollLeft()
        const dpr = this.chart.getCurrentDpr()

        const separatorUpperPaneId = this.hitTestPaneSeparator(mouseY)
        this.hoveredSeparatorUpperPaneId = separatorUpperPaneId
        if (separatorUpperPaneId) {
            this.crosshairPos = null
            this.crosshairIndex = null
            this.crosshairPrice = null
            this.hoveredIndex = null
            this.activePaneId = null
            return
        }

        const markerManager = this.chart.getMarkerManager()
        const worldX = scrollLeft + mouseX
        if (this.markerState.updateHoverFromPoint(worldX, mouseX, mouseY, markerManager)) {
            this.crosshairPos = null
            this.crosshairIndex = null
            this.crosshairPrice = null
            this.hoveredIndex = null
            return
        }

        if (!this.kLinePositions || !this.visibleRange || !this.kWidthPx) {
            this.clearHover()
            return
        }

        const kWidthLogical = this.kWidthPx / dpr

        let lo = 0, hi = this.kLinePositions.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.kLinePositions[mid]! < worldX) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }

        let localIdx = lo
        if (lo > 0 && lo < this.kLinePositions.length) {
            const prevCenter = this.kLinePositions[lo - 1]! + kWidthLogical / 2
            const currCenter = this.kLinePositions[lo]! + kWidthLogical / 2
            if (Math.abs(worldX - prevCenter) < Math.abs(worldX - currCenter)) {
                localIdx = lo - 1
            }
        } else if (lo === this.kLinePositions.length && this.kLinePositions.length > 0) {
            localIdx = this.kLinePositions.length - 1
        }

        const idx = localIdx + this.visibleRange.start
        const data = this.chart.getData()

        const pane = this.getPaneByY(mouseY)
        this.activePaneId = pane?.id || null

        if (idx >= 0 && idx < (data?.length ?? 0)) {
            this.crosshairIndex = idx

            const kLineStartX = this.kLinePositions[localIdx]!
            // 与影线位置算法一致: leftPx + (widthPx - 1) / 2
            const leftPx = Math.round(kLineStartX * dpr)
            const wickXPx = leftPx + (this.kWidthPx - 1) / 2
            const snappedX = wickXPx / dpr - scrollLeft

            this.crosshairPos = {
                x: Math.min(Math.max(snappedX, 0), plotWidth),
                y: Math.min(Math.max(mouseY, 0), plotHeight),
            }

            if (pane) {
                const localY = mouseY - pane.top
                this.crosshairPrice = pane.yAxis.yToPrice(localY)
            } else {
                this.crosshairPrice = null
            }
        } else {
            this.crosshairIndex = null
            this.crosshairPos = null
            this.crosshairPrice = null
        }

        const k = typeof this.crosshairIndex === 'number' ? data[this.crosshairIndex] : undefined
        if (!k || !pane || !pane.capabilities.candleHitTest) {
            this.hoveredIndex = null
            return
        }

        const localY = mouseY - pane.top
        const openY = pane.yAxis.priceToY(k.open)
        const closeY = pane.yAxis.priceToY(k.close)
        const highY = pane.yAxis.priceToY(k.high)
        const lowY = pane.yAxis.priceToY(k.low)
        const bodyTop = Math.min(openY, closeY)
        const bodyBottom = Math.max(openY, closeY)

        const kLineStartX = this.kLinePositions[localIdx]!
        const inUnitX = worldX - kLineStartX
        const cxLogical = kWidthLogical / 2

        const MIN_BODY_HIT_HEIGHT = 8
        const bodyHeight = Math.abs(bodyBottom - bodyTop)
        const effectiveBodyTop = bodyHeight < MIN_BODY_HIT_HEIGHT ? (bodyTop + bodyBottom) / 2 - MIN_BODY_HIT_HEIGHT / 2 : bodyTop
        const effectiveBodyBottom = bodyHeight < MIN_BODY_HIT_HEIGHT ? (bodyTop + bodyBottom) / 2 + MIN_BODY_HIT_HEIGHT / 2 : bodyBottom

        const HIT_WICK_HALF_EXTENDED = 3

        const hitBody = localY >= effectiveBodyTop && localY <= effectiveBodyBottom &&
            inUnitX >= 0 && inUnitX <= kWidthLogical
        const hitWick = Math.abs(inUnitX - cxLogical) <= HIT_WICK_HALF_EXTENDED &&
            localY >= Math.min(highY, lowY) && localY <= Math.max(highY, lowY)

        if (!hitBody && !hitWick) {
            this.hoveredIndex = null
            return
        }

        this.hoveredIndex = this.crosshairIndex

        const tooltipResult = computeTooltipPosition({
            mouseX,
            mouseY,
            viewWidth,
            viewHeight,
            plotWidth,
            plotHeight,
            tooltipSize: this.tooltipSize,
            useAnchorPositioning: this.useTooltipAnchorPositioning,
        })
        if (tooltipResult.anchorPlacement) {
            this.tooltipAnchorPlacement = tooltipResult.anchorPlacement
        }
        this.tooltipPos = tooltipResult.pos
    }


    /**
     * 重置所有交互状态（数据更新时调用）
     */
    reset(): void {
        this.isDragging = false
        this.dragMode = 'none'
        this.dragStartX = 0
        this.dragStartY = 0
        this.scrollStartX = 0
        this.activePaneIdOnDrag = null
        this.clearSeparatorState()
        this.isTouchSession = false
        this.pinchTracker.reset()
        this.crosshairPos = null
        this.crosshairIndex = null
        this.crosshairPrice = null
        this.hoveredIndex = null
        this.activePaneId = null
        this.markerState.reset()
        this.kLinePositions = null
        this.visibleRange = null
        this.lastHoverRenderKey = ''
        this.kWidthPx = null
    }

    /** 获取十字线指向的 K 线索引 */
    getCrosshairIndex(): number | null {
        return this.crosshairIndex
    }
}
