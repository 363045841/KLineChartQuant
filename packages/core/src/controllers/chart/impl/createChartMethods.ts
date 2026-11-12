/**
 * createChartMethods — ChartController 中“简单转发型”图表操作的集合工厂。
 *
 * 这些方法只做 disposed 守卫后转发到 Chart 的对应 facade，不持有额外状态；
 * 由 createChartController 展开（spread）合并进最终 controller 返回值。
 */

import type { Chart } from '@/engine/chart/index.js'
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  isIndicatorDefinitionLoaded,
  resolveCanonicalIndicatorId,
} from '@/engine/indicators/pipeline/index.js'
import type { InstanceMoveTarget, PanePatch } from '@/engine/pane/types.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type { IndicatorInstancePatch } from '@/engine/state/indicatorState.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { Plugin, PluginConfig, RenderContext } from '@/foundation/plugin/types.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { ChartFrameCaptureContext } from '../../screenshot/types.js'
import type { DrawingControllerCallbacks, IndicatorRole } from '../types.js'

/**
 * 构造一组轻量图表操作方法。
 *
 * @param chart 底层 Chart 引擎实例
 * @param isDisposed 查询 controller 是否已销毁；销毁后所有方法短路为默认值
 * @returns 可展开进 ChartController 的方法集合
 */
export function createChartMethods(chart: Chart, isDisposed: () => boolean) {
  /**
   * 同步指标方法只接受已加载的定义；目录中存在但实现未加载时提示宿主先加载，
   * 未知 ID 保持原有的静默失败语义。
   */
  function isLoaded(definitionId: string): boolean {
    if (isIndicatorDefinitionLoaded(definitionId)) return true
    if (getIndicatorDescriptor(definitionId)) {
      console.warn(
        `[ChartController] indicator '${definitionId}' is not loaded; await controller.loadIndicators(['${definitionId}']) first`,
      )
    }
    return false
  }

  /** 挂载宿主 Layer，销毁后不接收新资源。 */
  function useRenderer(layer: Layer<RenderContext>): void {
    if (isDisposed()) return
    chart.useRenderer(layer)
  }

  /** 按完整 ID 移除并释放宿主 Layer。 */
  function removeRenderer(id: string): void {
    if (isDisposed()) return
    chart.removeRenderer(id)
  }

  /** 按完整 ID 查询 Layer，销毁后返回 undefined。 */
  function getRenderer(id: string): Layer<RenderContext> | undefined {
    if (isDisposed()) return undefined
    return chart.getRenderer(id)
  }

  /** 外部 Layer 的数据变化后请求重绘。 */
  function requestRender(): void {
    if (isDisposed()) return
    chart.requestRender()
  }

  /** 请求截图帧；销毁后明确拒绝，避免吞掉异步截图结果。 */
  function captureFrame<T>(
    capture: (frame: ChartFrameCaptureContext) => T | Promise<T>,
  ): Promise<T> {
    if (isDisposed()) {
      return Promise.reject(
        new KLineChartError(GENERIC_ERROR_CODES.DISPOSED, '图表已销毁，无法截图'),
      )
    }
    return chart.captureFrame(capture)
  }

  /** 安装插件，由 PluginHost 管理安装状态。 */
  async function usePlugin(plugin: Plugin, config?: PluginConfig): Promise<void> {
    if (isDisposed()) return
    await chart.plugin.use(plugin, config)
  }

  /** 卸载插件，由插件清理自身 Layer 和订阅。 */
  async function removePlugin(name: string): Promise<void> {
    if (isDisposed()) return
    await chart.plugin.remove(name)
  }
  /** 获取当前缩放级别总数。 */
  function getZoomLevelCount(): number {
    if (isDisposed()) return 0
    return chart.zoom.getLevelCount()
  }

  /** 设置主题偏好 light|dark。 */
  function setTheme(nextTheme: 'light' | 'dark'): void {
    if (isDisposed()) return
    chart.theme.set(nextTheme)
  }

  /** 注入系统主题（settings.theme === auto 时驱动 effectiveTheme）。 */
  function setSystemTheme(nextTheme: 'light' | 'dark'): void {
    if (isDisposed()) return
    chart.theme.setSystem(nextTheme)
  }

  /** 跳转到指定缩放级别，可指定锚点 X。 */
  function zoomToLevel(level: number, anchorX?: number): void {
    if (isDisposed()) return
    chart.zoom.toLevel(level, anchorX)
  }

  /** 放大一级，可指定锚点 X。 */
  function zoomIn(anchorX?: number): void {
    if (isDisposed()) return
    chart.zoom.in(anchorX)
  }

  /** 缩小一级，可指定锚点 X。 */
  function zoomOut(anchorX?: number): void {
    if (isDisposed()) return
    chart.zoom.out(anchorX)
  }

  /** 转发指针事件，返回绘图控制器是否已消费该事件。 */
  function handlePointerEvent(
    e: PointerEvent,
    drawingController?: DrawingControllerCallbacks,
  ): boolean {
    if (isDisposed()) return false
    return chart.handlePointerEvent(e, drawingController)
  }

  /** 转发滚轮事件。 */
  function handleWheelEvent(e: WheelEvent): void {
    if (isDisposed()) return
    chart.handleWheelEvent(e)
  }

  /** 转发滚动事件。 */
  function handleScrollEvent(): void {
    if (isDisposed()) return
    chart.handleScrollEvent()
  }

  /** 转发双指捏合缩放。 */
  function handlePinchZoom(delta: number, centerClientX: number): void {
    if (isDisposed()) return
    chart.handlePinchZoom(delta, centerClientX)
  }

  /** 设置 tooltip 尺寸。 */
  function setTooltipSize(size: { width: number; height: number }): void {
    if (isDisposed()) return
    chart.interaction.setTooltipSize(size)
  }

  /** 开关 tooltip 锚点定位。 */
  function setTooltipAnchorPositioning(enabled: boolean): void {
    if (isDisposed()) return
    chart.interaction.setTooltipAnchorPositioning(enabled)
  }

  /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth）。 */
  function getContentWidth(): number {
    if (isDisposed()) return 0
    return chart.getContentWidth()
  }

  /** 获取左侧加载缓冲宽度（视口宽度）。 */
  function getLeftLoadBufferWidth(): number {
    if (isDisposed()) return 0
    return chart.getLeftLoadBufferWidth()
  }

  /** 滚动到最右侧（最新数据位置）。 */
  function scrollToRight(): void {
    if (isDisposed()) return
    chart.scrollToRight()
  }

  /** 按 K 线根数水平平移视口；正数向右、负数向左。 */
  function scrollByBars(bars: number): void {
    if (isDisposed()) return
    chart.scrollByBars(bars)
  }

  /** 重置图表视图：恢复默认时间位置、初始缩放与主图价格轴。 */
  function resetChart(): void {
    if (isDisposed()) return
    chart.resetChart()
  }

  /** 获取指标实例标题；找不到返回 undefined。 */
  function getIndicatorTitle(instanceId: string): string | undefined {
    if (isDisposed()) return undefined
    const instances = chart.indicators.instances.peek()
    const match = instances.find((inst) => inst.id === instanceId)
    return match?.label
  }

  /** 创建实例；返回实例身份，主副图语义一致。 */
  function addIndicator(
    definitionId: string,
    params?: Record<string, unknown>,
    target?: InstanceMoveTarget,
  ): string | null {
    if (isDisposed() || !isLoaded(definitionId)) return null
    return chart.panes.add(definitionId, params, target)
  }

  /** 迁移实例归属；源副图变空时自动回收。 */
  function moveIndicator(instanceId: string, target: InstanceMoveTarget): boolean {
    if (isDisposed()) return false
    return chart.panes.moveInstance(instanceId, target)
  }

  /** 删除实例；空副图一并回收。 */
  function removeIndicator(instanceId: string): boolean {
    if (isDisposed()) return false
    return chart.panes.removeInstance(instanceId)
  }

  /** 更新实例参数、显隐、排序或定义。 */
  function updateIndicator(instanceId: string, patch: IndicatorInstancePatch): boolean {
    if (isDisposed()) return false
    return chart.panes.updateInstance(instanceId, patch)
  }

  /** 清空所有子窗格。 */
  function clearPanes(): void {
    if (isDisposed()) return
    chart.panes.clearPanes()
  }

  /** 更新窗格属性。 */
  function updatePane(paneId: string, patch: PanePatch): boolean {
    if (isDisposed()) return false
    return chart.panes.updatePane(paneId, patch)
  }

  /** 移除窗格。 */
  function removePane(paneId: string): boolean {
    if (isDisposed()) return false
    return chart.panes.removePane(paneId)
  }

  /** 移动窗格到目标索引。 */
  function movePane(paneId: string, targetIndex: number): boolean {
    if (isDisposed()) return false
    return chart.panes.movePane(paneId, targetIndex)
  }

  /** 恢复主图价格轴的纵轴缩放和偏移。 */
  function resetMainPriceAxis(): void {
    if (isDisposed()) return
    chart.resetPriceTransform(MAIN_PANE_ID)
  }

  /** 更新设置（高层 API）。 */
  function updateSettingsFacade(settings: Record<string, unknown>): void {
    if (isDisposed()) return
    chart.updateSettingsFacade(settings)
  }

  /** 更新选项（高层 API）。 */
  function updateOptionsFacade(options: Record<string, unknown>): void {
    if (isDisposed()) return
    chart.updateOptionsFacade(options)
  }

  return {
    resetMainPriceAxis,
    /** 逐 Pane 轴命令与 UI 共用核心入口。 */
    setPanePriceAxisScaleType: (
      paneId: string,
      type: import('../../../foundation/types/scaleType.js').ScaleType,
    ) => {
      if (!isDisposed()) chart.setPanePriceAxisScaleType(paneId, type)
    },
    setPanePriceAxisRangeMode: (
      paneId: string,
      mode: import('../../../foundation/config/priceAxisRangeMode.js').PriceAxisRangeMode,
    ) => {
      if (isDisposed()) return
      chart.setPanePriceAxisRangeMode(paneId, mode)
    },
    resetPanePriceAxis: (paneId: string) => {
      if (!isDisposed()) chart.resetPriceTransform(paneId)
    },
    getZoomLevelCount,
    setTheme,
    setSystemTheme,
    zoomToLevel,
    zoomIn,
    zoomOut,
    handlePointerEvent,
    handleWheelEvent,
    handleScrollEvent,
    handlePinchZoom,
    addIndicator,
    moveIndicator,
    removeIndicator,
    updateIndicator,
    setTooltipSize,
    setTooltipAnchorPositioning,
    getContentWidth,
    getLeftLoadBufferWidth,
    useRenderer,
    removeRenderer,
    getRenderer,
    requestRender,
    captureFrame,
    usePlugin,
    removePlugin,
    scrollToRight,
    scrollByBars,
    resetChart,
    getIndicatorTitle,
    clearPanes,
    updatePane,
    removePane,
    movePane,
    updateSettingsFacade,
    updateOptionsFacade,
  }
}
