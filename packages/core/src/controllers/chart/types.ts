/**
 * chart 模块对外契约入口。
 *
 * ChartController 及其依赖类型当前仍与绘图、指标、工具栏等共享类型混居在
 * `controllers/types.ts` 中，尚不具备拆出独立契约的条件。迁移期间本文件作为
 * chart 的契约出口，从共享 types.js 重导出 chart 相关类型；待共享类型完成拆分
 * 后应改为在此直接定义，避免长期依赖共享文件。
 */

export type {
  BatchDrawingPatch,
  ChartController,
  ChartControllerFactory,
  ChartIndicatorConfig,
  ChartMountOptions,
  ChartViewport,
  CreateDrawingInput,
  CustomDataSource,
  DrawingControllerCallbacks,
  DrawingObject,
  DrawingStyleKey,
  IndicatorDefinition,
  IndicatorInstance,
  IndicatorRole,
  InteractionSnapshot,
  KLineData,
  PaneLayoutInfo,
  PaneSpec,
  SubPaneInfo,
  SymbolInfo,
  SymbolSpec,
} from '../types.js'
