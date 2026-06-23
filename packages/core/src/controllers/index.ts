// -- Controller types (framework-agnostic) --
export type {
    KLineData,
    IndicatorPaneRole,
    IndicatorRole,
    IndicatorParamDef,
    IndicatorDefinition,
    IndicatorInstance,
    ActiveIndicator,
    SubPaneInfo,
    DrawingToolType,
    DrawingObject,
    InteractionSnapshot,
    DrawingControllerCallbacks,
    IndicatorSelectorController,
    ToolbarController,
    ToolDefinition,
    ToolId,
    DrawingState,
    DrawingController,
    ChartMountOptions,
    ChartViewport,
    ChartController,
    ChartControllerFactory,
    PaneSpec,
    DrawingChartAdapter,
    DrawingChartViewport,
    PaneLayoutInfo,
    SymbolSpec,
    DataFetcher,
} from './types'

export { createChartController } from './createChartController'
export { createIndicatorSelectorController } from './createIndicatorSelectorController'

// -- Engine sub-path re-exports (Phase 9: facade for Vue adapter) --

// Utility functions
export {
    zoomLevelToKWidth,
    kGapFromKWidth,
} from '../engine/utils/zoom'
export { getPhysicalKLineConfig } from '../engine/utils/klineConfig'

// Indicator types & config
export type { SubIndicatorType } from '../engine/renderers/Indicator'

// Indicator data helpers
export {
    allIndicators,
    findIndicator,
    isSubIndicatorId,
} from '../engine/renderers/Indicator/indicatorCatalog'
export type { Indicator } from '../engine/renderers/Indicator/indicatorCatalog'
export { loadBuiltinIndicators, isBuiltinIndicatorsLoaded } from '../engine/indicators/registerBuiltins'

// Data fetcher adapters
export { thousandMockDataFetcher, hundredMockDataFetcher, baostockDataFetcher, routerDataFetcher, DataBuffer } from '../data-fetchers'
export type { DataWindow } from '../data-fetchers'

// Drawing
export { DrawingInteractionController } from '../engine/drawing'
export type { DrawingToolId } from '../engine/drawing'
