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
    PaneInfo,
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
} from '../engine/renderers/Indicator/indicatorData'
export type { Indicator } from '../engine/renderers/Indicator/indicatorData'

// Drawing
export { DrawingInteractionController } from '../engine/drawing'
export type { DrawingToolId } from '../engine/drawing'
