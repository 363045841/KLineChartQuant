import { marketDataProviderRegistry } from '../../../data/provider/registry.js'
import { Chart } from '../../../engine/chart.js'
import type {
  ChartOptions,
  IndicatorInstance as LegacyIndicatorInstance,
  SubPaneInfo as LegacySubPaneInfo,
  ViewportState as LegacyViewportState,
} from '../../../engine/chartTypes.js'
import { getRegisteredIndicatorDefinition } from '../../../engine/indicators/indicatorDefinitionRegistry.js'
import { loadBuiltinIndicators } from '../../../engine/indicators/registerBuiltins.js'
import { MAIN_PANE_ID } from '../../../engine/paneIds.js'
import { hasSubPaneRendererMetadata } from '../../../engine/subPaneManager.js'
import { kGapFromKWidth, zoomLevelToKWidth } from '../../../engine/utils/zoom.js'
import { CONTROLLER_ERROR_CODES, KLineChartError } from '../../../errors.js'
import { createChartAgentController } from '../../../features/agent/impl/chartAgentController.js'
import { createIndicatorQuery } from '../../../features/agent/impl/indicator/indicatorQuery.js'
import { resolveSettings } from '../../../foundation/config/chartSettings.js'
import { computed, type ReadonlySignal } from '../../../foundation/reactivity/index.js'
import { generateUUID } from '../../../foundation/utils/uuid.js'
import { createDefaultRendererHost, type RendererBackend } from '../../../rendering/render/index.js'
import { allIndicatorDefinitions } from '../../indicatorDefinitionCatalog.js'
import {
  createViewWorkspacePersistence,
  loadStoredViewWorkspaces,
} from '../../viewWorkspacePersistence.js'
import type {
  ChartController,
  ChartMountOptions,
  ChartViewport,
  IndicatorInstance,
  InteractionSnapshot,
  PaneSpec,
  SubPaneInfo,
  SymbolInfo,
} from '../types.js'
import { DEFAULT_OPTS } from './controllerDefaults.js'
import { createChartMethods } from './createChartMethods.js'
import { createDataMethods } from './createDataMethods.js'
import { createDrawingMethods } from './createDrawingMethods.js'
import { mountChartDom } from './mountChartDom.js'

function mapViewportState(vp: LegacyViewportState): ChartViewport {
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

function mapIndicatorInstance(indicator: LegacyIndicatorInstance): IndicatorInstance {
  return {
    id: indicator.id,
    definitionId: indicator.definitionId,
    label: indicator.label,
    name: indicator.name,
    role: indicator.role,
    paneId: indicator.paneId,
    params: { ...indicator.params },
  }
}

function mapSubPaneInfo(subPane: LegacySubPaneInfo): SubPaneInfo {
  return {
    instanceId: subPane.instanceId,
    paneId: subPane.paneId,
    indicatorId: subPane.indicatorId,
    ordinal: subPane.ordinal,
    params: { ...subPane.params },
    ratio: subPane.ratio,
  }
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

  await loadBuiltinIndicators()
  const initialViewWorkspaces = loadStoredViewWorkspaces()
  const mounted = mountChartDom(opts)

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

  const initialSettings = resolveSettings(opts.settings)
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
      initialViewWorkspaces: initialViewWorkspaces ?? undefined,
      marketSessions: opts.marketSessions,
    },
  )
  chart.setViewWorkspacePersistence(
    createViewWorkspacePersistence(() => chart.kernel.snapshotViewWorkspaces()),
  )

  if (import.meta.env?.MODE !== 'production' && typeof window !== 'undefined') {
    ;(window as Window & { __chart?: Chart }).__chart = chart
  }

  const currentDpr =
    typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  const currentKWidth = zoomLevelToKWidth(initialZoomLevel, {
    minKWidth: DEFAULT_OPTS.minKWidth,
    maxKWidth: DEFAULT_OPTS.maxKWidth,
    zoomLevelCount,
  })
  const currentKGap = kGapFromKWidth(currentKWidth, currentDpr)

  const viewport = computed(() => mapViewportState(chart.viewport()))
  const indicators = computed(() => chart.indicators.instances().map(mapIndicatorInstance))
  const subPanes = computed(() => chart.indicators.subPanes().map(mapSubPaneInfo))
  const themeSignal: ReadonlySignal<'light' | 'dark'> = chart.theme.effective
  const selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>> = chart.drawing.selectedIds
  const globalDrawingLock: ReadonlySignal<boolean> = chart.drawing.globalLock
  const paneRatios: ReadonlySignal<Readonly<Record<string, number>>> = chart.paneRatios
  const paneLayout: ReadonlySignal<ReadonlyArray<PaneSpec>> = chart.paneLayout
  const interactionState: ReadonlySignal<InteractionSnapshot> = chart.interactionState
  const symbolCatalog: ReadonlySignal<ReadonlyArray<SymbolInfo>> = chart.symbolCatalog

  try {
    chart.applyRenderState(currentKWidth, currentKGap, initialZoomLevel)
  } catch {
    /* tolerate jsdom */
  }
  if (opts.data && opts.data.length > 0) {
    try {
      chart.setData([...opts.data])
    } catch {
      /* tolerate first-paint racing */
    }
  }
  if (opts.symbols && opts.symbols.length > 0) {
    chart.setSymbols([opts.symbols[0]!])
    if (opts.symbols.length > 1) chart.setComparisonSpecs(opts.symbols)
  }
  if (opts.theme) {
    try {
      chart.theme.set(opts.theme)
    } catch {
      /* tolerate first-paint racing */
    }
  }

  const agent = createChartAgentController({
    chartId: generateUUID(),
    dataState: chart.kernel.data,
    currentSpec: chart.kernel.dataManager.readonly.currentSpec,
    chartMode: chart.kernel.mode.readonly.chartMode,
    selectedRange: chart.selectedRange,
    indicators,
    indicatorQuery: createIndicatorQuery({ dataState: chart.kernel.data }),
    marketDataProviderRegistry,
    marketDataCache: chart.getMarketDataCache(),
    drawingDocument: chart.drawingDocument,
    drawingCommands: chart.drawingCommands,
    drawings: chart.drawing.drawings,
    selectedDrawingIds: chart.drawing.selectedIds,
    getDrawingPaneIds: () => chart.panes.getLayoutSpecs().map((pane) => pane.id),
    paneManager: chart.kernel.paneManager,
    comparisonCommands: chart.comparisonCommands,
    resolveSubPaneIndicatorId: (indicatorId) =>
      getRegisteredIndicatorDefinition(indicatorId)?.displayName ?? null,
    isSubPaneRendererAvailable: (indicatorId, paneId) => {
      const definition = getRegisteredIndicatorDefinition(indicatorId)
      return definition !== undefined && hasSubPaneRendererMetadata(definition, paneId, indicatorId)
    },
  })

  let disposed = false
  const isDisposed = () => disposed
  const dataMethods = createDataMethods(chart, isDisposed)
  const drawingMethods = createDrawingMethods(chart, isDisposed)
  const chartMethods = createChartMethods(chart, isDisposed)

  function dispose(): void {
    if (disposed) return
    disposed = true
    dataMethods.dispose()
    try {
      void chart.destroy()
    } catch {
      /* best-effort */
    }
    try {
      mounted.cleanup()
    } catch {
      /* best-effort */
    }
  }

  return {
    agent,
    viewport,
    rightAxisEffectiveWidth: chart.rightAxisEffectiveWidth,
    data: chart.data,
    dataLoading: chart.loading,
    dataError: chart.dataError,
    marketDataCacheStats: chart.getMarketDataCache().stats,
    symbols: chart.symbols,
    theme: themeSignal,
    settings: chart.kernel.settings.readonly.settings,
    rendererRuntime: chart.kernel.renderer.readonly.runtime,
    chartMode: chart.kernel.mode.readonly.chartMode,
    lastBarPeriod: chart.kernel.mode.readonly.lastBarPeriod,
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
    interactionState,
    selectedRange: chart.selectedRange,
    rangeSelection: chart.rangeSelection,
    legendTemplateContext: chart.legendTemplateContext,
    comparisonColors: chart.comparisonColors,
    comparisonLoading: chart.comparisonLoading,
    comparisonSpecs: chart.comparisonSpecs,
    symbolCatalog,
    catalog: allIndicatorDefinitions(),
    alertController: chart.alertController,
    ...dataMethods.methods,
    ...chartMethods,
    ...drawingMethods,
    dispose,
  }
}
