/**
 * createChartMethods — ChartController 中“简单转发型”图表操作的集合工厂。
 *
 * 这些方法只做 disposed 守卫后转发到 Chart 的对应 facade，不持有额外状态；
 * 由 createChartController 展开（spread）合并进最终 controller 返回值。
 */

import type { Chart } from '@/engine/chart.js'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry.js'
import type { CustomMarkerEntity } from '@/engine/marker/registry.js'
import { MAIN_PANE_ID } from '@/engine/paneIds.js'
import type { CreatePaneInput, PanePatch } from '@/engine/paneManager.js'
import { hasSubPaneRendererMetadata } from '@/engine/subPaneManager.js'
import type { Plugin, PluginConfig, RenderContext } from '@/foundation/plugin/types.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { DrawingControllerCallbacks, IndicatorRole } from '../types.js'

/**
 * 构造一组轻量图表操作方法。
 *
 * @param chart 底层 Chart 引擎实例
 * @param isDisposed 查询 controller 是否已销毁；销毁后所有方法短路为默认值
 * @returns 可展开进 ChartController 的方法集合
 */
export function createChartMethods(chart: Chart, isDisposed: () => boolean) {
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

  /** 添加指标实例，返回实例 id；失败返回 null。 */
  function addIndicator(
    definitionId: string,
    role: IndicatorRole,
    params?: Record<string, unknown>,
  ): string | null {
    if (isDisposed()) return null
    return chart.indicators.add(definitionId, role, params)
  }

  /** 移除指标实例。 */
  function removeIndicator(instanceId: string): boolean {
    if (isDisposed()) return false
    return chart.indicators.remove(instanceId)
  }

  /** 调整主图 Legend 的顺序，边界处返回 false。 */
  function moveMainIndicator(definitionId: string, direction: 'up' | 'down'): boolean {
    if (isDisposed()) return false
    return chart.indicators.moveMain(definitionId, direction)
  }

  /** 校验主图定义后，以一次状态写入替换对应 Legend。 */
  function replaceMainIndicator(definitionId: string, nextDefinitionId: string): boolean {
    if (isDisposed()) return false
    return chart.indicators.replaceMain(definitionId, nextDefinitionId)
  }

  /** 隐藏或显示主图指标；只影响绘制，不删除实例。 */
  function setMainIndicatorHidden(definitionId: string, hidden: boolean): boolean {
    if (isDisposed()) return false
    return chart.indicators.setMainHidden(definitionId, hidden)
  }

  /** 隐藏或显示指定 pane 的副图指标；只影响绘制，不删除 pane。 */
  function setSubIndicatorHidden(paneId: string, hidden: boolean): boolean {
    if (isDisposed()) return false
    return chart.indicators.setSubHidden(paneId, hidden)
  }

  /** 更新指标实例参数。 */
  function updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
    if (isDisposed()) return false
    return chart.indicators.updateParams(instanceId, params)
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

  /** 获取指标实例标题；找不到返回 undefined。 */
  function getIndicatorTitle(instanceId: string): string | undefined {
    if (isDisposed()) return undefined
    const instances = chart.indicators.instances.peek()
    const match = instances.find((inst) => inst.id === instanceId)
    return match?.label
  }

  /** 创建子窗格。 */
  function createPane(input: CreatePaneInput): boolean {
    if (isDisposed()) return false
    return chart.panes.create(input)
  }

  /** 清空所有子窗格。 */
  function clearPanes(): void {
    if (isDisposed()) return
    chart.panes.clear()
  }

  /** 用已注册的 sub-pane 指标替换窗格内容。 */
  function replacePaneContent(
    paneId: string,
    indicatorId: string,
    params: Record<string, unknown>,
  ): boolean {
    if (isDisposed()) return false
    const definition = getRegisteredIndicatorDefinition(indicatorId)
    if (!definition || !hasSubPaneRendererMetadata(definition, paneId, definition.displayName))
      return false
    return chart.panes.replaceContent(paneId, definition.displayName, params)
  }

  /** 更新窗格内容参数。 */
  function updatePaneContent(paneId: string, params: Record<string, unknown>): boolean {
    if (isDisposed()) return false
    return chart.panes.updateContent(paneId, params)
  }

  /** 更新窗格属性。 */
  function updatePane(paneId: string, patch: PanePatch): boolean {
    if (isDisposed()) return false
    return chart.panes.update(paneId, patch)
  }

  /** 移除窗格。 */
  function removePane(paneId: string): boolean {
    if (isDisposed()) return false
    return chart.panes.remove(paneId)
  }

  /** 移动窗格到目标索引。 */
  function movePane(paneId: string, targetIndex: number): boolean {
    if (isDisposed()) return false
    return chart.panes.move(paneId, targetIndex)
  }

  /** 全量更新自定义标记。 */
  function updateCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>): void {
    if (isDisposed()) return
    chart.markers.update([...markers])
  }

  /** 清空自定义标记。 */
  function clearCustomMarkers(): void {
    if (isDisposed()) return
    chart.markers.clear()
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
    removeIndicator,
    moveMainIndicator,
    replaceMainIndicator,
    setMainIndicatorHidden,
    setSubIndicatorHidden,
    updateIndicatorParams,
    setTooltipSize,
    setTooltipAnchorPositioning,
    getContentWidth,
    getLeftLoadBufferWidth,
    useRenderer,
    removeRenderer,
    getRenderer,
    requestRender,
    usePlugin,
    removePlugin,
    scrollToRight,
    getIndicatorTitle,
    createPane,
    clearPanes,
    replacePaneContent,
    updatePaneContent,
    updatePane,
    removePane,
    movePane,
    updateCustomMarkers,
    clearCustomMarkers,
    updateSettingsFacade,
    updateOptionsFacade,
  }
}
