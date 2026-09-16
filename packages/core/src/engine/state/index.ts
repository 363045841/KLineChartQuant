/** State 模块统一导出入口。 */

export {
  ChartStateKernel,
  type ChartStateKernelDeps,
  type ChartStateKernelModule,
} from './chartStateKernel.js'
export { createDataManagerState, type DataManagerStateModule } from './dataManagerState.js'
export { createDataState, type DataStateModule } from './dataState.js'
export { createDrawingState, type DrawingStateModule } from './drawingState.js'
export {
  createIndicatorState,
  type IndicatorInstanceRole,
  type IndicatorInstanceSpec,
  type IndicatorStateModule,
  type SubPaneSpec,
} from './indicatorState.js'
export {
  createInteractionState,
  type DragMode,
  type InteractionDeps,
  type InteractionSnapshot,
  type InteractionStateModule,
} from './interactionState.js'
export { createMarkerState, type MarkerStateModule } from './markerState.js'
export { type ChartModeId, createModeState, type ModeStateModule } from './modeState.js'
export { createOptionsState, type OptionsStateModule } from './optionsState.js'
export { createPaneState, type PaneStateModule } from './paneState.js'
export { createSettingsState, type SettingsStateModule } from './settingsState.js'
export { StateKernel, type SubStateModule } from './stateKernel.js'
export {
  createSystemThemeState,
  createThemeState,
  type SystemThemeStateModule,
  type ThemeStateModule,
} from './themeState.js'
export {
  clampDpr,
  createViewportState,
  getEffectiveDprLogic,
  type ViewportDomDeps,
  type ViewportSignalDeps,
  type ViewportStateModule,
} from './viewportState.js'
export { createZoomState, type ZoomDeps, type ZoomStateModule } from './zoomState.js'
