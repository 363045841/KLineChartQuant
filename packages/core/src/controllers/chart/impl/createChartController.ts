import { lookupInstrumentsBySymbol, searchInstruments } from '@/data/provider/impl/instrumentSearch.js'
import type { MarketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import type { ChartOptions, ViewportState as EngineViewportState } from '@/engine/chart/index.js'
import { Chart } from '@/engine/chart/index.js'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins.js'
import { extractTemplate } from '@/engine/indicatorTemplate/impl/templateExtract.js'
import { IndicatorTemplateManager } from '@/engine/indicatorTemplate/impl/templateManager.js'
import { collectLayoutIndicatorIds } from '@/engine/layout/impl/layoutIndicators.js'
import { LayoutManager } from '@/engine/layout/impl/layoutManager.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import { CONTROLLER_ERROR_CODES, KLineChartError } from '@/errors.js'
import { formatDrawingAnchorTime } from '@/features/agent/impl/drawingAnchorTime.js'
import {
  type ChartAgentDrawingScope,
  type ChartAgentMarketCapability,
  type ChartAgentMarketSource,
  createChartAgentComparisonCommands,
  createChartAgentController,
  createChartAgentDrawingCommands,
  createChartAgentIndicatorCommands,
  createChartAgentMarketQueries,
  createChartAgentToolDeps,
  createMarketDataTextFormatter,
  createUnwiredScripts,
} from '@/features/agent/index.js'
import { normalizeSettings } from '@/foundation/config/chartSettings.js'
import { batch, computed, type ReadonlySignal } from '@/foundation/reactivity/index.js'
import { createDefaultRendererHost, type RendererBackend } from '@/rendering/render/index.js'
import { createIndicatorCatalog } from '../../indicatorCatalog/index.js'
import type {
  ChartController,
  ChartMountOptions,
  ChartViewport,
  InteractionSnapshot,
  PaneSpec,
  SymbolInfo,
} from '../types.js'
import { DEFAULT_OPTS } from './controllerDefaults.js'
import { createChartMethods } from './createChartMethods.js'
import { createDataMethods } from './createDataMethods.js'
import { createDrawingMethods } from './createDrawingMethods.js'
import { mountChartDom } from './mountChartDom.js'

// engine 侧视口模型 → controller 公开模型的字段投影。
function mapViewportState(vp: EngineViewportState): ChartViewport {
  return {
    zoomLevel: vp.zoomLevel,
    plotWidth: vp.plotWidth,
    plotHeight: vp.plotHeight,
    dpr: vp.dpr,
    visibleFrom: vp.visibleFrom,
    visibleTo: vp.visibleTo,
    kWidth: vp.kWidth,
    kGap: vp.kGap,
  }
}

/**
 * 行情工具的源视图。
 *
 * 品种查询与行情各有自己的源集合：查询只看参与目录搜索的源，行情按能力筛选。
 * 工具描述、source 校验与路由都读这一份，避免出现三套不一致的答案。
 */
function listAgentMarketSources(
  registry: MarketDataProviderRegistry,
  capability: ChartAgentMarketCapability,
): ReadonlyArray<ChartAgentMarketSource> {
  const providers =
    capability === 'instrument'
      ? registry.getSearchableByPriority()
      : registry.getEnabledByCapability({ capability })
  return providers.map((provider) => ({
    id: provider.source.id,
    ...(provider.source.description === undefined
      ? {}
      : { description: provider.source.description }),
  }))
}

export async function createChartController(opts: ChartMountOptions): Promise<ChartController> {
  if (!opts) {
    throw new KLineChartError(
      CONTROLLER_ERROR_CODES.CONFIG_INVALID,
      '[createChartController] opts is required',
    )
  }
  if (!opts.container) {
    throw new KLineChartError(
      CONTROLLER_ERROR_CODES.CONFIG_INVALID,
      '[createChartController] opts.container must be a non-null HTMLElement',
    )
  }

  // 系统图层随图表创建；布局先恢复配置，再按需加载引用的指标实现。
  if (opts.indicatorLoading === 'all') await loadBuiltinIndicators(opts.runtime.definitions)

  // 共享运行时由宿主创建：图表只消费，不拥有计算与警报。
  const runtime = opts.runtime
  const marketContext = runtime.market
  const indicatorCatalog = createIndicatorCatalog(runtime.definitions)

  const initialZoomLevel = opts.initialZoomLevel ?? DEFAULT_OPTS.initialZoomLevel
  const zoomLevelCount = opts.zoomLevels ?? DEFAULT_OPTS.zoomLevels
  const chartOptions: ChartOptions = {
    yPaddingPx: opts.yPaddingPx ?? DEFAULT_OPTS.yPaddingPx,
    rightAxisWidth: opts.rightAxisWidth ?? DEFAULT_OPTS.rightAxisWidth,
    leftAxisWidth: opts.leftAxisWidth ?? DEFAULT_OPTS.leftAxisWidth,
    bottomAxisHeight: opts.bottomAxisHeight ?? DEFAULT_OPTS.bottomAxisHeight,
    minKWidth: opts.minKWidth ?? DEFAULT_OPTS.minKWidth,
    maxKWidth: opts.maxKWidth ?? DEFAULT_OPTS.maxKWidth,
    priceLabelWidth: opts.priceLabelWidth ?? DEFAULT_OPTS.priceLabelWidth,
    panes: [{ id: MAIN_PANE_ID, ratio: 1 }],
    paneGap: 0,
    zoomLevels: zoomLevelCount,
    initialZoomLevel,
  }

  /** 挂载 DOM 与图表；失败时释放会话，不留下半截所有权。 */
  async function mountChart(): Promise<{
    mounted: ReturnType<typeof mountChartDom>
    chart: Chart
  }> {
    let mounted: ReturnType<typeof mountChartDom> | undefined
    try {
      mounted = mountChartDom(opts)
      const initialSettings = normalizeSettings({
        ...opts.settings,
        ...(opts.theme && { theme: opts.theme }),
      })
      const rendererHost = await createDefaultRendererHost(
        initialSettings.rendererBackend as RendererBackend,
      )
      const chart = new Chart(
        {
          container: mounted.container,
          scrollContent: mounted.scrollContent,
          canvasLayer: mounted.canvasLayer,
          rightAxisLayer: mounted.rightAxisLayer,
          leftAxisLayer: mounted.leftAxisLayer,
          xAxisCanvas: mounted.xAxisCanvas,
        },
        chartOptions,
        {
          rendererHost,
          initialSettings,
          calculationHub: runtime.calculation,
          marketSessionRegistry: runtime.marketSessions,
          definitions: runtime.definitions,
          marketDataContext: runtime.market,
        },
      )
      return { mounted, chart }
    } catch (error) {
      mounted?.cleanup()
      throw error
    }
  }

  const { mounted, chart } = await mountChart()

  if (import.meta.env?.MODE !== 'production' && typeof window !== 'undefined') {
    ;(window as Window & { __chart?: Chart }).__chart = chart
  }

  const viewport = computed(() => mapViewportState(chart.viewport()))
  const indicators = computed(() => chart.indicators.instances())
  const subPanes = computed(() => chart.indicators.subPanes())
  const themeSignal: ReadonlySignal<'light' | 'dark'> = chart.theme.effective
  const selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>> = chart.drawing.selectedIds
  const globalDrawingLock: ReadonlySignal<boolean> = chart.drawing.globalLock
  const paneRatios: ReadonlySignal<Readonly<Record<string, number>>> = chart.paneRatios
  const paneLayout: ReadonlySignal<ReadonlyArray<PaneSpec>> = chart.paneLayout
  const interactionState: ReadonlySignal<InteractionSnapshot> = chart.interactionState
  const symbolCatalog: ReadonlySignal<ReadonlyArray<SymbolInfo>> = chart.symbolCatalog

  let disposed = false
  const isDisposed = () => disposed
  const dataMethods = createDataMethods(chart, isDisposed)
  const drawingMethods = createDrawingMethods(chart, isDisposed)
  const chartMethods = createChartMethods(chart, runtime.definitions, isDisposed)
  const layoutManager = new LayoutManager(
    {
      // 导出前先捕获当前视口，使活动布局的滚动/缩放位置一并落盘。
      exportLayout: () => {
        chart.captureViewportSnapshot()
        return chart.kernel.exportLayout()
      },
      createLayout: () => chart.kernel.createLayout(),
      loadContent: (document) => runtime.definitions.load(collectLayoutIndicatorIds(document)),
      applyLayout: (document) => {
        if (isDisposed()) throw new Error('图表已销毁')
        batch(() => {
          if (document.currentSymbol !== undefined) {
            dataMethods.methods.setPrimaryMarket(document.currentSymbol ?? null)
          }
          // 品种切换清理旧范围后，再恢复布局中的锁定范围。
          chart.kernel.applyLayout(document)
        })
        chart.drawingCommands.history.reset()
        chart.scheduleDraw()
      },
    },
    { restore: opts.layoutRestore !== false, storageId: opts.layoutStorageId },
  )
  await layoutManager.initialize()

  // 指标模板与布局分开存储：模板描述「用了哪些指标」，布局描述整张图表的快照。
  const templateManager = new IndicatorTemplateManager({
    extractIndicators: () => extractTemplate(chart.kernel.snapshotViewWorkspaces()),
    applyIndicators: (workspaces) => {
      if (isDisposed()) throw new Error('图表已销毁')
      chart.kernel.applyIndicatorTemplate(workspaces)
      chart.scheduleDraw()
    },
    userIndicatorConfigurations: chart.kernel.indicator.readonly.configurations,
    loadIndicators: (indicatorIds) => runtime.definitions.load(indicatorIds),
    definitions: runtime.definitions,
  })
  await templateManager.initialize().catch((error: unknown) => {
    console.error('[ChartController] Indicator template initialization failed', error)
  })
  // 显式品种优先于恢复布局，所有行情统一通过 Provider 加载。
  if (opts.symbols && opts.symbols.length > 0) {
    chart.setPrimaryMarket(opts.symbols[0] ?? null)
    if (opts.symbols.length > 1) chart.setComparisonSpecs(opts.symbols)
  }
  const layoutSubscriptions = [
    ...[
      chart.kernel.dataManager.readonly.currentSpec,
      chart.kernel.indicator.readonly.workspaces,
      chart.kernel.indicator.readonly.favoriteIndicatorIds,
      chart.kernel.pane.readonly.workspaces,
      chart.kernel.settings.readonly.settings,
      chart.kernel.drawing.readonly.drawings,
      chart.kernel.systemObjects.readonly.state,
    ].map((signal) => signal.subscribe(() => layoutManager.scheduleAutoSave())),
    // 滚动与缩放逐帧变化：静止后再比较一次，避免每帧导出并序列化布局。
    ...[
      chart.kernel.viewport.readonly.scrollLeft,
      chart.kernel.zoom.readonly.zoomLevel,
      chart.kernel.axesState.readonly.paneRanges,
    ].map((signal) => signal.subscribe(() => layoutManager.scheduleCoalescedAutoSave())),
  ]

  const marketRegistry = marketContext.registry
  const marketFormatter = createMarketDataTextFormatter()
  // 窗格身份只来自布局：行号是唯一坐标，指标实例身份不参与落点解析。
  const layoutPanes = () => chart.panes.getLayoutSpecs()
  const readPaneRow = (paneId: string): number | null => {
    const index = layoutPanes().findIndex((pane) => pane.id === paneId)
    return index < 0 ? null : index
  }
  /** 图表时区：图元时间读写都用它，不跟随宿主本地时区。 */
  const chartTimezone = (): string => chart.kernel.data.readonly.activeBuffer().timezone ?? 'UTC'
  const drawingScope = (): ChartAgentDrawingScope => ({
    rows: layoutPanes().map((pane) => pane.id),
    period: chart.kernel.dataManager.readonly.currentPeriod.peek(),
    timezone: chartTimezone(),
    workspace: chart.drawing.getWorkspaceId(),
  })
  const formatAnchorTime = (timestamp: number): string =>
    formatDrawingAnchorTime(timestamp, chartTimezone())
  const agentTools = createChartAgentToolDeps({
    indicators: createChartAgentIndicatorCommands({
      facade: chart.indicators,
      panes: chart.panes,
      loadIndicators: (indicatorIds) => runtime.definitions.load(indicatorIds),
      resolveCanonicalId: (indicatorId) => {
        const definition = runtime.definitions.getDefinition(indicatorId)
        return definition ? runtime.definitions.resolveCanonicalId(definition) : null
      },
      isRendererAvailable: (indicatorId) => runtime.definitions.isLoaded(indicatorId),
      readInputDefs: (indicatorId) =>
        indicatorCatalog.peek().find((definition) => definition.id === indicatorId)?.inputs,
      scope: () => ({
        period: chart.kernel.dataManager.readonly.currentPeriod.peek(),
        timezone: chartTimezone(),
      }),
    }),
    drawings: createChartAgentDrawingCommands({
      drawingDocument: chart.drawingDocument,
      drawingCommands: chart.drawingCommands,
      scope: drawingScope,
      bars: () => chart.getData(),
    }),
    comparisons: createChartAgentComparisonCommands(chart.comparisonCommands),
    market: createChartAgentMarketQueries({
      listSources: (capability) => listAgentMarketSources(marketRegistry, capability),
      lookup: (input) =>
        lookupInstrumentsBySymbol(marketRegistry, {
          symbol: input.query,
          ...(input.sources === undefined ? {} : { sources: input.sources }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        }),
      search: (input) =>
        searchInstruments(marketRegistry, {
          keyword: input.query,
          limit: input.limit,
          ...(input.sources === undefined ? {} : { sources: input.sources }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        }),
      cache: chart.getMarketDataCache(),
      now: Date.now,
      formatter: marketFormatter,
    }),
    // 参考正文随脚本包发布，由宿主注入；未注入时工具仍在清单里，调用会明确失败。
    scripts: opts.scripts ?? createUnwiredScripts(),
  })

  const agent = createChartAgentController({
    dataState: chart.kernel.data,
    currentSpec: chart.kernel.dataManager.readonly.currentSpec,
    selectedRange: chart.selectedRange,
    drawings: chart.drawing.drawings,
    selectedDrawingIds: chart.drawing.selectedIds,
    readPaneRow,
    formatAnchorTime,
    tools: agentTools,
    marketDataTextFormatter: marketFormatter,
  })

  let disposal: Promise<void> | undefined

  function dispose(): Promise<void> {
    if (disposal) return disposal
    disposed = true
    for (const unsubscribe of layoutSubscriptions) unsubscribe()
    disposal = (async () => {
      const failures: unknown[] = []
      for (const release of [
        mounted.cleanup,
        () => templateManager.dispose(),
        () => layoutManager.dispose(),
        () => chart.destroy(),
      ]) {
        try {
          await release()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length) throw new AggregateError(failures, 'Chart controller disposal failed')
    })()
    return disposal
  }

  return {
    layouts: layoutManager.layouts,
    activeLayoutId: layoutManager.activeLayoutId,
    layoutAutoSave: layoutManager.layoutAutoSave,
    layoutDirty: layoutManager.layoutDirty,
    layoutSaveError: layoutManager.layoutSaveError,
    createLayout: (input) => layoutManager.createLayout(input),
    setLayoutAutoSave: (input) => layoutManager.setLayoutAutoSave(input),
    exportLayout: () => layoutManager.exportLayout(),
    applyLayout: (document) => layoutManager.applyLayout(document),
    loadIndicators: (definitionIds) => runtime.definitions.load(definitionIds),
    listLayouts: () => layoutManager.listLayouts(),
    saveLayout: (input) => layoutManager.saveLayout(input),
    switchLayout: (input) => layoutManager.switchLayout(input),
    renameLayout: (input) => layoutManager.renameLayout(input),
    duplicateLayout: (input) => layoutManager.duplicateLayout(input),
    deleteLayout: (input) => layoutManager.deleteLayout(input),
    templates: templateManager.templates,
    recentTemplateIds: templateManager.recentTemplateIds,
    currentIndicators: templateManager.currentIndicators,
    listTemplates: () => templateManager.listTemplates(),
    saveTemplate: (input) => templateManager.saveTemplate(input),
    renameTemplate: (input) => templateManager.renameTemplate(input),
    deleteTemplate: (input) => templateManager.deleteTemplate(input),
    applyTemplate: (input) => templateManager.applyTemplate(input),
    agent,
    favoriteIndicatorIds: chart.kernel.indicator.readonly.favoriteIndicatorIds,
    setIndicatorFavorite: (indicatorId, favorite) => {
      if (!isDisposed()) chart.kernel.indicator.actions.setFavorite(indicatorId, favorite)
    },
    viewport,
    rightAxisEffectiveWidth: chart.rightAxisEffectiveWidth,
    leftAxisEffectiveWidth: chart.leftAxisEffectiveWidth,
    data: chart.data,
    withIndicatorData: (compute) => chart.withIndicatorData(compute),
    dataLoading: chart.loading,
    dataError: chart.dataError,
    marketDataCacheStats: chart.getMarketDataCache().stats,
    symbols: chart.symbols,
    theme: themeSignal,
    settings: chart.kernel.settings.readonly.settings,
    paneScaleTypes: chart.kernel.pane.readonly.paneScaleTypes,
    panePriceAxisRanges: chart.kernel.axesState.readonly.paneRanges,
    rendererRuntime: chart.kernel.renderer.readonly.runtime,
    chartMode: chart.kernel.mode.readonly.chartMode,
    lastBarPeriod: chart.kernel.mode.readonly.lastBarPeriod,
    footprintSupported: chart.kernel.footprint.readonly.supported,
    indicators,
    subPanes,
    drawingTool: chart.drawing.tool,
    drawings: chart.drawing.drawings,
    canUndoDrawing: chart.drawingCommands.history.canUndo,
    canRedoDrawing: chart.drawingCommands.history.canRedo,
    selectedDrawingIds,
    globalDrawingLock,
    paneRatios,
    paneLayout,
    paneGeometry: chart.kernel.pane.readonly.paneGeometry,
    interactionState,
    selectedRange: chart.selectedRange,
    rangeSelection: chart.rangeSelection,
    frameGeometry: chart.frameGeometry,
    legend: chart.legend,
    objects: chart.objects,
    axes: chart.axes,
    comparisonColors: chart.comparisonColors,
    comparisonLoading: chart.comparisonLoading,
    comparisonSpecs: chart.comparisonSpecs,
    symbolCatalog,
    catalog: indicatorCatalog,
    activeRangePreset: chart.activeRangePreset,
    ...dataMethods.methods,
    ...chartMethods,
    ...drawingMethods,
    dispose,
  }
}
