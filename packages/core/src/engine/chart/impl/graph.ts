/**
 * 图表实例装配器：只创建子系统并连接依赖。
 *
 * 不读取图表状态、不做业务判断；需要宿主行为时通过 ChartGraphHost 端口调用。
 */

import { ChartStateKernel } from '../../state/chartStateKernel.js'
import { ChartPaneLayout, UpdateLevel } from '../../pane/index.js'
import { ChartPaneFacade } from '../facade/chartPaneFacade.js'
import { ChartAxisColumns } from '../../axisWidth/chartAxisColumns.js'
import { IncrementalLoadHint } from '../../viewport/incrementalLoadHint.js'
import { ViewportScrollBridge } from '../../viewport/viewportScrollBridge.js'
import { ChartDataManager } from '../../data/chartDataManager.js'
import { ComparisonCommands } from '../../data/comparisonCommands.js'
import { ChartZoomController } from '../../viewport/chartZoomController.js'
import { ChartThemeFacade } from '../facade/chartThemeFacade.js'
import { ChartZoomFacade } from '../facade/chartZoomFacade.js'
import { ChartTimeNavigation } from '../../viewport/chartTimeNavigation.js'
import { ChartRenderer } from '../../frame/index.js'
import { ChartDrawingFacade } from '../facade/chartDrawingFacade.js'
import { ChartIndicatorFacade } from '../facade/chartIndicatorFacade.js'
import { createLegendDomRenderer } from '../../renderers/legend/impl/createLegendDomRenderer.js'
import { createObjectTree } from '../../objects/impl/createObjectTree.js'
import { createSystemObjects } from '../../objects/impl/systemObjects.js'
import { createObjectAxesApi } from '../../pane/impl/objectAxes.js'
import { createDrawingObjectLayers } from '../../drawing/index.js'
import { DrawingCommands, DrawingDocument } from '../../drawing/index.js'
import { ChartIndicatorManager } from '../../indicators/chartIndicatorManager.js'
import { LegendManager } from '../../legend/impl/LegendManager.js'
import { RuntimeProjectionCoordinator } from '../../runtimeProjection/impl/runtimeProjectionCoordinator.js'
import { PaneProjection } from '../../runtimeProjection/paneProjection.js'
import { createPluginHost } from '../../../foundation/plugin/index.js'
import { createFootprintRuntime } from '@/components/footprint/runtime/impl/createFootprintRuntime.js'
import { CHART_RENDERERS_SERVICE, type ChartRendererAccess } from '../../../controllers/renderers/index.js'
import { computed, type ReadonlySignal } from '../../../foundation/reactivity/signal.js'
import { symbolInfoFromSpec } from '../../data/symbolInfo.js'
import { lookupInstrumentsBySymbol } from '../../../data/provider/instrumentSearch.js'
import { AUTO_SOURCE } from '../../../data/provider/types.js'
import { resolveMarketDataCacheMaxBytes } from '../../../data/buffer/impl/marketDataPolicy.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { availablePriceRangeModes } from '../../../foundation/config/priceAxisRangeMode.js'
import { PRICE_SERIES_AXIS_ID } from '../../renderers/rendererIds.js'
import type { ChartGraphHost } from './graphHost.js'
import type { ChartRuntime } from './runtime.js'
import type { ChartDom, ChartOptions } from '../types.js'
import { DEFAULT_ZOOM_LEVEL_COUNT } from '../../viewport/zoom.js'
import { DEFAULT_PRICE_LABEL_WIDTH } from '../../pane/types.js'
import { seriesSelectionKey } from '@/data/buffer/seriesSelection.js'
import { createDefaultRendererHostSync } from '../../../rendering/render/index.js'

/** 装配器输入。 */
export interface ChartGraphInput {
  readonly dom: ChartDom
  readonly opt: ChartOptions
  readonly runtime: ChartRuntime
  readonly host: ChartGraphHost
}

/** 创建一个图表实例的全部运行时服务。 */
export function createChartServices(input: ChartGraphInput) {
  const { dom, opt, runtime, host } = input
  function resolveMarketDataContext(value: ChartRuntime) {
    return value.marketDataContext
  }
  function resolveRendererHost(value: ChartRuntime) {
    return value?.rendererHost ?? createDefaultRendererHostSync()
  }
  function resolveInitialZoomLevel(options: ChartOptions): number {
    return options.initialZoomLevel ?? 1
  }
  function resolveZoomLevelCount(options: ChartOptions): number {
    return Math.max(2, Math.round(options.zoomLevels ?? DEFAULT_ZOOM_LEVEL_COUNT))
  }
    const definitions: import('../../indicators/registry/index.js').DefinitionRegistry = runtime.definitions
    const marketDataProviderRegistry: import('../../../data/provider/registry.js').MarketDataProviderRegistry = resolveMarketDataContext(runtime).registry
    const legendDom: ReturnType<typeof createLegendDomRenderer> = createLegendDomRenderer(
      dom.canvasLayer,
      (collapsed) => legend.setMainCollapsed(collapsed),
      (id, action) => legend.execute(id, action),
    )
    const viewportScrollBridge: ViewportScrollBridge = new ViewportScrollBridge(() => dom.container)
    // 会话表只有一份：图表与计算会话共用的注册表由宿主传入。
    const marketSessions: import('../../../foundation/config/marketSession/marketSessionRegistry.js').MarketSessionRegistry = runtime.marketSessionRegistry
    const pluginHost: ReturnType<typeof createPluginHost> = createPluginHost()
    const rendererHost: ReturnType<typeof resolveRendererHost> = resolveRendererHost(runtime)

    const zoomLevelCount = resolveZoomLevelCount(opt)
    const initialZoomLevel = resolveInitialZoomLevel(opt)

    // ── StateKernel: single composition root (owns options, zoom, data, viewport, pane, theme, drawing, interaction) ──
    const kernel: ChartStateKernel = new ChartStateKernel({
      initialOptions: {
        ...opt,
        zoomLevelCount,
      },
      initialZoomLevel,
      initialSettings: runtime?.initialSettings,
      initialRendererRuntime: rendererHost.runtime,
      marketSessions: marketSessions,
      definitions: definitions,
      scheduleDraw: (level) => host.scheduleDraw(level as UpdateLevel | undefined),
    })
    rendererHost.setListeners({
      onRuntimeChange: (rendererRuntime) => {
        kernel.renderer.actions.setRuntime(rendererRuntime)
      },
      requestRedraw: () => host.scheduleDraw(UpdateLevel.All),
    })

    // ── InteractionController ──
    const interaction = host.createInteraction(kernel)

    // ── Legacy managers ──
    const layoutManager: ChartPaneLayout = new ChartPaneLayout({
      getDom: () => dom,
      getOption: () => {
        const o = kernel.options.readonly.options.peek()
        return {
          rightAxisWidth: o.rightAxisWidth,
          leftAxisWidth: o.leftAxisWidth,
          yPaddingPx: o.yPaddingPx,
          priceLabelWidth: o.priceLabelWidth,
          paneGap: o.paneGap,
          defaultPaneMinHeightPx: o.defaultPaneMinHeightPx,
        }
      },
      viewport: kernel.viewport,
      scheduleDraw: (level) => host.scheduleDraw(level),
      pane: kernel.pane,
    })
    const panes: ChartPaneFacade = new ChartPaneFacade({
      kernel: kernel,
      layoutManager: layoutManager,
      invalidateDrawingHistory: () => drawingCommands.history.reset(),
    })

    // 首帧测量前按配置下限占位：宿主与轴区共用同一份宽度，避免从 0 展开。
    const axisColumns: ChartAxisColumns = new ChartAxisColumns(
      kernel.options.readonly.options, layoutManager, dom, DEFAULT_PRICE_LABEL_WIDTH,
    )

    const historyHint: IncrementalLoadHint = new IncrementalLoadHint({
      getOption: () => host.getRenderOptions(),
      getDom: () => dom,
      viewport: kernel.viewport,
    })
    const dataManager: ChartDataManager = new ChartDataManager(
      {
        data: runtime.data,
        marketSessions: marketSessions,
        viewport: kernel.viewport,
        comparison: kernel.comparison,
        preserveViewOnPrepend: (previousScroll, count) => {
          timeNavigation.preserveOnPrepend(previousScroll, count)
          host.scheduleDraw()
        },
        showHistoryPrepend: (count) => historyHint.show(count, host.getLeftLoadBufferWidth()),
        needsTrades: () => kernel.footprint.readonly.enabled.peek(),
        updateTradeInput: (input) => kernel.data.actions.setTrades(input),
        scheduleDraw: (level) => host.scheduleDraw(level),
        resetInteraction: () => {
          host.getInteraction().reset()
          zoomController.stopAnimation()
        },
        projectIndicatorFeed: (selection, displayTimestamps) => {
          indicatorManager.projectFeed(
            selection === null ? null : seriesSelectionKey(selection),
            displayTimestamps,
          )
        },
        publishSymbols: (symbols) => kernel.actions.setSymbols(symbols),
      },
      kernel.data,
      kernel.dataManager,
    )
    const activeDataError = computed(() => host.selectionError() ?? dataManager.dataError())
    dataManager.setCacheMaxBytes(
      resolveMarketDataCacheMaxBytes(
        kernel.settings.readonly.settings.peek().marketDataCacheMaxMiB,
      ),
    )
    const disposeTradeDemand = kernel.footprint.readonly.enabled.subscribe(() =>
      dataManager.reconcileTradeInput(),
    )
    const footprintRuntime: ReturnType<typeof createFootprintRuntime> = createFootprintRuntime({
      input$: kernel.footprint.readonly.input,
      commit: kernel.footprint.actions.commit,
    })
    const disposeFootprintDraw = kernel.footprint.readonly.renderState.subscribe(() =>
      host.scheduleDraw(),
    )

    // 对比品种唯一写原语；UI 与 Agent 共用同一实例。
    const comparisonCommands: ComparisonCommands = new ComparisonCommands({
      getSpecs: () => kernel.comparison.readonly.specs.peek(),
      setSpecs: (specs) => host.setComparisonSpecs(specs),
      registerSpec: (spec) => dataManager.registerSymbols([symbolInfoFromSpec(spec)]),
      resolveInstrument: async ({ symbol, source }, signal) => {
        // 具体源才限定查询范围，auto/缺省时允许跨全部已启用数据源解析。
        const restrictedSources = source && source !== AUTO_SOURCE ? [source] : undefined
        const result = await lookupInstrumentsBySymbol(marketDataProviderRegistry, {
          symbol,
          ...(restrictedSources === undefined ? {} : { sources: restrictedSources }),
          ...(signal === undefined ? {} : { signal }),
        })
        // 候选不做挑选：歧义裁决属于 ComparisonCommands 的领域策略。
        if (result.instruments.length > 0 || restrictedSources === undefined)
          return {
            candidates: result.instruments,
            searchedSources: result.searchedSources,
            foundElsewhereSources: [],
            failedSources: result.failedSources,
          }
        // 限定源未命中：跨全部已启用源再查一次，用于提示 Agent 换源重试。
        const elsewhere = await lookupInstrumentsBySymbol(marketDataProviderRegistry, {
          symbol,
          ...(signal === undefined ? {} : { signal }),
        })
        return {
          candidates: [],
          searchedSources: result.searchedSources,
          foundElsewhereSources: [...new Set(elsewhere.instruments.map((item) => item.source))],
          failedSources: result.failedSources,
        }
      },
      isHidden: (identity) => kernel.comparison.readonly.hidden.peek().get(identity) === true,
      setHidden: (identity, hidden) => kernel.comparison.actions.setHidden(identity, hidden),
      getColor: (identity) => kernel.comparison.readonly.colors.peek().get(identity),
      scheduleDraw: () => host.scheduleDraw(),
    })

    const zoomController: ChartZoomController = new ChartZoomController({
      viewport: kernel.viewport,
      options: kernel.options,
      onStart: () => host.getInteraction().stopInertia(),
      onFinish: () => host.finishNavigation(),
      onChange: () => host.scheduleDraw(),
    })
    const theme: ChartThemeFacade = new ChartThemeFacade({
      kernel: kernel,
      scheduleDraw: () => host.scheduleDraw(),
    })
    const zoom: ChartZoomFacade = new ChartZoomFacade({
      kernel: kernel,
      controller: zoomController,
    })
    const timeNavigation: ChartTimeNavigation = new ChartTimeNavigation({
      viewport: kernel.viewport,
      bars: () => dataManager.getData(),
      initialZoomLevel,
      memory: kernel.viewMemory,
    })

    // 系统对象（K 线等）的显隐、顺序与所属 Pane；图层在 initCoreRenderers 后注册。
    const systemObjects: ReturnType<typeof createSystemObjects> = createSystemObjects({
      state: kernel.systemObjects,
      readFootprint: () => kernel.footprint.readonly.renderState.peek(),
      isLayerActive: (layerId) =>
        kernel.activeRenderers$().some((descriptor) => descriptor.layerId === layerId),
      getLayer: (layerId) => host.getRenderer(layerId) ?? null,
      useRenderer: (layer) => host.useRenderer(layer),
      removeRenderer: (layerId) => host.removeRenderer(layerId),
      getRows: () => objects.groups.peek().flatMap((group) => group.rows),
      // 主序列对象显示当前品种代码；未选品种时用中性占位文案。
      getLabel: () =>
        kernel.dataManager.readonly.currentSpec.peek()?.instrument.symbol ?? '未选择品种',
      addPane: (anchorPaneId, placement) => panes.addPane(anchorPaneId, placement),
      paneExists: (paneId) => panes.hasPane(paneId),
      removePane: (paneId) => {
        panes.removePane(paneId)
      },
      // 指标由图表侧直接判断，其余内容走 kernel 的唯一判定。
      hasPaneObjects: (paneId) =>
        kernel.indicator.readonly.instances
          .peek()
          .some((instance) => instance.paneId === paneId) || kernel.hasPaneContent(paneId),
      requestDraw: () => host.scheduleDraw(),
    })

    // 先创建 Scene，确保恢复的指标首次 projection 能直接挂载 Layer。
    const renderer: ChartRenderer = new ChartRenderer({
      clock: runtime?.clock,
      getMarketSession: () => {
        const spec = dataManager.symbols.peek()[0]
        if (!spec) return undefined
        return marketSessions.get(spec.instrument.sessionId ?? spec.instrument.exchange)
      },
      getDom: () => dom,
      getOption: () => host.getRenderOptions(),
      getPaneRenderers: () =>
        host.paneRenderers().filter((renderer) => renderer.getPane().height > 0),
      getInteraction: () => host.getInteraction(),
      getSceneRenderer: () => rendererHost.renderer,
      getPluginHost: () => pluginHost,
      theme$: kernel.effectiveTheme$,
      options: kernel.options,
      viewport: kernel.viewport,
      commitPendingLayout: () => host.commitPendingLayout(),
      commitViewportScroll: (targetScrollLeft) =>
        viewportScrollBridge.commit(
          targetScrollLeft,
          dom.scrollContent
            ? {
                element: dom.scrollContent,
                width: kernel.viewport.readonly.contentWidth.peek(),
              }
            : undefined,
        ),
      getDataManager: () => dataManager,
      getIndicatorManager: () => indicatorManager,
      getActiveMode: () => host.activeMode(),
      dataView$: kernel.mode.readonly.dataView,
      primaryRenderer$: kernel.mode.readonly.effectivePrimaryRenderer,
      footprintState$: kernel.footprint.readonly.renderState,
      settings$: kernel.settings.readonly.settings,
      getPricePaneId: () => kernel.systemObjects.readonly.pricePaneId.peek(),
      axesState: kernel.axesState,
      drawings$: kernel.drawing.readonly.drawings,
      selectedDrawingIds$: kernel.drawing.readonly.selectedDrawingIds,
      getOverlay: () => host.drawingSession()?.getPaintOverlay() ?? [],
      getSelectionMarquee: () => host.drawingSession()?.getSelectionMarquee() ?? null,
      getSnapIndicator: () => host.drawingSession()?.getSnapIndicator() ?? null,
      projectLegendFrame: (contexts) => {
        legend.projectFrame(contexts)
        const paneOrder = kernel.pane.readonly.paneSpecs.peek().map((pane) => pane.id)
        const rows = legend.rows.peek()
        const mainVisible = host.getOption().legend?.visible !== false
        legendDom.update({
          primaryPaneId: kernel.systemObjects.readonly.pricePaneId.peek(),
          rowsByPane: paneOrder.map((paneId) => ({
            paneId,
            rows:
              paneId === kernel.systemObjects.readonly.pricePaneId.peek() && !mainVisible
                ? []
                : rows.filter((row) => row.paneId === paneId),
          })),
          mainCollapsed: legend.mainCollapsed.peek(),
          canCollapse: legend.canCollapse(),
        })
      },
      getLegendConfiguration: () => legend.configuration.peek(),
      clearLegendFrame: () => {
        legend.clearFrame()
        legendDom.clear()
      },
      commitAxisWidths: (widths) => host.commitAxisWidths(widths),
    })
    pluginHost.registerService(CHART_RENDERERS_SERVICE, {
      useRenderer: (layer) => host.useRenderer(layer),
      removeRenderer: (id) => host.removeRenderer(id),
      getRenderer: (id) => host.getRenderer(id),
      requestRender: () => host.requestRender(),
    } satisfies ChartRendererAccess)
    renderer.registerDrawingPlugins()
    renderer.initCoreRenderers()
    const drawing: ChartDrawingFacade = new ChartDrawingFacade({
      kernel: kernel,
      dataManager: dataManager,
      getSession: () => host.drawingSession(),
      scheduleDraw: () => host.scheduleDraw(),
      getCommands: () => drawingCommands,
    })
    const drawingDocument: DrawingDocument = new DrawingDocument({
      drawingState: kernel.drawing,
      hasPaneId: (paneId) => panes.getLayoutSpecs().some((pane) => pane.id === paneId),
      getWorkspaceId: () => drawing.getWorkspaceId(),
      getSymbolKey: () => drawing.getSymbolKey(),
    })
    const drawingCommands: DrawingCommands = new DrawingCommands({
      document: drawingDocument,
      requestDraw: () => {
        host.cancelDrawingSession()
        host.scheduleDraw()
      },
    })
    // 用户绘图也以渲染对象进入对象树；跨 Pane 改变价格轴语义，因此只允许 Pane 内排序。
    const drawingObjects: ReturnType<typeof createDrawingObjectLayers> = createDrawingObjectLayers({
      drawings$: kernel.drawing.readonly.drawings,
      getScope: () => ({
        workspaceId: drawing.getWorkspaceId(),
        symbolKey: drawing.getSymbolKey(),
        period: dataManager.currentPeriod,
      }),
      useRenderer: (layer) => host.useRenderer(layer),
      removeRenderer: (id) => host.removeRenderer(id),
      commands: drawingCommands,
      hasPane: (paneId) => panes.getLayoutSpecs().some((pane) => pane.id === paneId),
    })
    // 标的、周期、视图或 Pane 变化都会改变图元作用域，需要重新投影对象层。
    const disposeDrawingObjects = [
      kernel.dataManager.readonly.currentSpec.subscribe(() => drawingObjects.sync()),
      kernel.mode.readonly.lastBarPeriod.subscribe(() => drawingObjects.sync()),
      kernel.mode.readonly.dataView.subscribe(() => drawingObjects.sync()),
      kernel.pane.readonly.paneSpecs.subscribe(() => drawingObjects.sync()),
    ]

    const indicatorManager: ChartIndicatorManager = new ChartIndicatorManager({
      hub: runtime.calculationHub,
      getPeriod: () => dataManager.currentPeriod,
      plotColors$: computed(() => {
        const settings = kernel.settings.readonly.settings()
        return resolveThemeColors(
          kernel.effectiveTheme$(),
          settings.isAsiaMarket,
          settings.colorPresetSettings,
        )
      }),
      getOption: () => host.getRenderOptions(),
      getPluginHost: () => pluginHost,
      getRenderer: (id) => host.getRenderer(id),
      useRenderer: (layer) => host.useRenderer(layer),
      removeRenderer: (id) => host.removeRenderer(id),
      objectCommands: (instanceId) => host.createIndicatorObjectCommands(instanceId),
      getLayer: (id) => renderer.getScene().getLayer(id) ?? null,
      paneRatios$: kernel.pane.readonly.paneRatios as ReadonlySignal<
        Readonly<Record<string, number>>
      >,
      paneSpecs$: kernel.pane.readonly.paneSpecs,
      getLastVisibleRange: () => dataManager.getCurrentVisibleRange() ?? { start: 0, end: 0 },
      getCrosshairPos: () => host.getInteraction().crosshairPos,
      getCrosshairPrice: () => host.getInteraction().crosshairPrice,
      getActivePaneId: () => host.getInteraction().activePaneId,
      scheduleDraw: (level) => host.scheduleDraw(level),
      indicator: kernel.indicator,
      definitions: definitions,
      removeInstancesByDefinition: (definitionId) =>
        indicators.removeByDefinition(definitionId),
    })
    const axes: ReturnType<typeof createObjectAxesApi> = createObjectAxesApi({
      listBindings: () =>
        [...indicatorManager.getPaneAxes().values()].flatMap((axes) =>
          axes.flatMap(({ paneId, axisId, objectIds }) =>
            objectIds.map((objectId) => ({ objectId, paneId, axisId })),
          ),
        ),
      getAxisPaneId: (axisId) =>
        host.paneRenderers()
          .find((renderer) => renderer.getPane().axes.some((axis) => axis.axisId === axisId))
          ?.getPane().id,
      getPane: (paneId) => host.paneRenderer(paneId)?.getPane(),
      getLayout: (paneId) => renderer.getAxisLayout(paneId),
      availableRangeModes: (axisId) =>
        availablePriceRangeModes(axisId === PRICE_SERIES_AXIS_ID && host.activeMode().fitsPriceBars),
      paneState: kernel.pane,
      ranges: kernel.axesState,
      project: () => {
        renderer.invalidateFrame()
        host.scheduleDraw()
      },
    })
    const paneProjection = new PaneProjection(layoutManager, kernel.pane, axes)
    const runtimeProjection: RuntimeProjectionCoordinator = new RuntimeProjectionCoordinator({
      capture: () => host.captureRuntimeProjection(),
      projectPanes: (snapshot) => layoutManager.projectState(snapshot.panes),
      projectAxes: (snapshot) => {
        layoutManager.setPaneAxes(snapshot.axes)
        indicatorManager.acceptPaneAxes(snapshot.axes)
        kernel.axesState.actions.retainAxes(
          new Set([...snapshot.axes.values()].flatMap((axes) => axes.map((axis) => axis.axisId))),
        )
      },
      configureAxes: (snapshot) => paneProjection.configureAxes(snapshot),
      projectLayers: (snapshot) => indicatorManager.projectIndicators(snapshot.indicators),
      invalidateFrame: () => {
        host.unlockAxisWidth()
        renderer.invalidateFrame()
        host.getInteraction().invalidateHover()
      },
      publishView: () => paneProjection.publish(),
      requestDraw: (level) => renderer.scheduleDraw(level),
    })
    const indicators: ChartIndicatorFacade = new ChartIndicatorFacade({
      manager: indicatorManager,
      commands: kernel.paneManager.instances,
      invalidateDrawingHistory: () => drawingCommands.history.reset(),
    })
    const legend: LegendManager = new LegendManager({
      host: pluginHost,
      panes: panes,
      indicators: indicators,
      comparisons: comparisonCommands,
      definitions: definitions,
      getOptions: () => host.getOption(),
      hasPrimarySymbol: () => dataManager.symbols.peek().length > 0,
      getPricePaneId: () => kernel.systemObjects.readonly.pricePaneId.peek(),
      // 仅脚本指标提供代码编辑入口，普通指标不展示该按钮。
      isScriptIndicator: (definitionId) => !!definitions.getDefinition(definitionId)?.document,
      requestRender: () => host.scheduleDraw(),
    })
    const objects: ReturnType<typeof createObjectTree> = createObjectTree({
      layers: renderer.getScene().layers,
      paneSpecs: kernel.pane.readonly.paneSpecs,
      // 绘图与系统对象的显隐/锁定/顺序是原地字段，由各自状态信号通知对象树重读。
      revision: computed(() => [
        drawingObjects.revision(),
        systemObjects.revision(),
        host.layerRevision(),
        kernel.dataManager.readonly.currentSpec(),
      ]),
    })

    // 设置来源统一为内核；布局恢复和界面提交都投影到实际运行资源。
    let previousSettings = kernel.settings.readonly.settings.peek()
    const disposeSettingsProjection = kernel.settings.readonly.settings.subscribe(() => {
      const next = kernel.settings.readonly.settings.peek()
      const previous = previousSettings
      previousSettings = next
      host.projectSettings(previous, next)
    })
  return {
    kernel,
    interaction,
    definitions,
    marketDataProviderRegistry,
    legendDom,
    viewportScrollBridge,
    marketSessions,
    pluginHost,
    rendererHost,
    layoutManager,
    panes,
    drawingCommands,
    axisColumns,
    historyHint,
    dataManager,
    timeNavigation,
    comparisonCommands,
    zoomController,
    theme,
    zoom,
    systemObjects,
    renderer,
    drawing,
    drawingDocument,
    drawingObjects,
    disposeDrawingObjects,
    indicatorManager,
    axes,
    indicators,
    legend,
    runtimeProjection,
    objects,
    footprintRuntime,
    disposeTradeDemand,
    disposeFootprintDraw,
    disposeSettingsProjection,
    activeDataError,
  }
}
