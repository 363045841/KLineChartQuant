/** State 模块统一导出入口。 */

export {
  ChartStateKernel,
  type ChartStateKernelDeps,
  type ChartStateKernelModule,
} from './chartStateKernel'
export { createDataManagerState, type DataManagerStateModule } from './dataManagerState'
export { createDataState, type DataStateModule } from './dataState'
export { createDrawingState, type DrawingStateModule } from './drawingState'
export {
  createIndicatorState,
  type IndicatorInstanceRole,
  type IndicatorInstanceSpec,
  type IndicatorStateModule,
  type SubPaneSpec,
} from './indicatorState'
export {
  createInteractionState,
  type DragMode,
  type InteractionDeps,
  type InteractionSnapshot,
  type InteractionStateModule,
} from './interactionState'
export { createMarkerState, type MarkerStateModule } from './markerState'
export { type ChartModeId, createModeState, type ModeStateModule } from './modeState'
export { createOptionsState, type OptionsStateModule } from './optionsState'
export { createPaneState, type PaneStateModule } from './paneState'
export { createSettingsState, type SettingsStateModule } from './settingsState'
export { StateKernel, type SubStateModule } from './stateKernel'
export {
  createSystemThemeState,
  createThemeState,
  type SystemThemeStateModule,
  type ThemeStateModule,
} from './themeState'
export {
  clampDpr,
  createViewportState,
  getEffectiveDprLogic,
  type ViewportDomDeps,
  type ViewportSignalDeps,
  type ViewportStateModule,
} from './viewportState'
export { createZoomState, type ZoomDeps, type ZoomStateModule } from './zoomState'
