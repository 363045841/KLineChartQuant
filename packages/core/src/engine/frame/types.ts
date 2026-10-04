/** frame 模块对外契约：帧渲染器依赖注入接口与投影版本类型。 */

import type { ChartSettings } from '../../foundation/config/chartSettings.js'
import type { PluginHostImpl, RenderContext } from '../../foundation/plugin/index.js'
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { Clock } from '../../foundation/utils/clock.js'
import type { ASHARE_MARKET_SESSION } from '../../foundation/utils/timeShareAxisLabels.js'
import type { Renderer } from '../../rendering/render/Renderer.js'
import type { ChartDom, ChartOptions } from '../chart/index.js'
import type { ChartDataView, ChartModeHandler } from '../chartModel/index.js'
import type { InteractionController } from '../controller/interaction.js'
import type { ChartDataManager } from '../data/chartDataManager.js'
import type { DrawingSelectionMarquee, DrawingStoreDeps } from '../drawing/index.js'
import type { ChartIndicatorManager } from '../indicators/chartIndicatorManager.js'
import type { MarkerManagerDeps } from '../marker/registry.js'
import type { PaneRenderer } from '../pane/index.js'
import type { MainPriceAxisStateModule } from '../state/mainPriceAxisState.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { ZoomStateModule } from '../state/zoomState.js'
import type { VisiblePriceExtrema } from '../utils/visiblePriceExtrema.js'

/** 已解析的图表选项：kWidth / kGap 必填，由样式与配置派生。 */
export type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
  kWidth: number
  kGap: number
}

/** 帧渲染器依赖注入契约；ChartRenderer 不直接持有状态，只从该接口读取。 */
export interface RendererDependencies {
  /** 帧开始时读取一次的时间源，测试可注入。 */
  clock?: Clock
  /** 当前主品种的市场时段，倒计时显示与刷新共用。 */
  getMarketSession: () => typeof ASHARE_MARKET_SESSION | undefined
  getDom: () => ChartDom
  getOption: () => ResolvedChartOptions
  getPaneRenderers: () => PaneRenderer[]
  getInteraction: () => InteractionController
  getSceneRenderer: () => Renderer
  getPluginHost: () => PluginHostImpl
  /** 当前数据视图应显示的主图指标 ID 快照。 */
  getVisibleMainIndicatorIds: () => ReadonlyArray<string>
  /** 生效主题 SSOT */
  theme$: ReadonlySignal<'light' | 'dark'>
  /** zoomLevel / kWidth SSOT */
  zoom: ZoomStateModule
  /** zoomLevelCount 等 options SSOT */
  options: OptionsStateModule
  /** scroll / dpr / plot 几何 SSOT */
  viewport: ViewportStateModule
  /** 由 Chart 的 ViewportScrollBridge 在 render frame 内提交原生滚动。 */
  commitViewportScroll: (targetScrollLeft: number) => void
  getDataManager: () => ChartDataManager
  getIndicatorManager: () => ChartIndicatorManager
  getActiveMode: () => ChartModeHandler
  dataView$: ReadonlySignal<ChartDataView>
  settings$: ReadonlySignal<ChartSettings>
  mainPriceAxis: MainPriceAxisStateModule
  customMarkers$: MarkerManagerDeps['customMarkers$']
  drawings$: DrawingStoreDeps['drawings$']
  selectedDrawingIds$: DrawingStoreDeps['selectedDrawingIds$']
  getOverlay?: DrawingStoreDeps['getOverlay']
  /** 绘图交互会话中的临时框选，不进入持久化图元列表。 */
  getSelectionMarquee?: () => DrawingSelectionMarquee | null
  /** 主图图例上下文发布（dom / external 均触发；draw 内回调） */
  onLegendRows?: RenderContext['publishLegendRows']
  /** 无可绘制数据或清空图表时同步释放 DOM 标题。 */
  onClearLegendRows?: () => void
  onLegendContext?: (
    ctx: import('../renderers/Indicator/mainIndicatorLegend/types.js').LegendTemplateContext | null,
  ) => void
  /** 可视区极值跨数量级时才请求右轴实测与布局更新。 */
  commitRightAxisWidthMeasurement?: (extrema: VisiblePriceExtrema) => void
}

/** 数据版本、展示参数与轴映射快照；横轴坐标按值比较。 */
export interface ProjectionRevision {
  readonly inputs: readonly unknown[]
  readonly centers: readonly number[]
}
