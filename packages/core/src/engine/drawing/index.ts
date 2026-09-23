/**
 * 绘图模块唯一公开入口。
 *
 * 只做重导出：模块契约在 `./types.ts`，实现按职责分散在
 * `model/`、`session/`、`geometry/`、`interaction/`、`render/` 的 `impl/` 下。
 * 模块外调用方依赖本文件，禁止指向内部实现路径。
 */

/** foundation 拥有的渲染 primitive 契约，按模块公开面重导出。 */
export type {
  AreaPrimitive,
  ArrowPrimitive,
  DrawingLabelPosition,
  DrawingPrimitive,
  DrawingStyle,
  LinePrimitive,
  PointPrimitive,
  ScreenPoint,
  TextPrimitive,
} from '../../foundation/plugin/index.js'

export { projectDrawingsForFrame } from './geometry/impl/frameProjection.js'
export { computeLinearRegression } from './geometry/impl/linearRegression.js'
export type {
  DrawingLine,
  DrawingPointerAnchor,
  InteractionDrawingAnchor,
  PointerCoordinates,
  ResolveDrawingPointerOptions,
  ResolvedInteractionAnchor,
  VerticalHandleLine,
} from './geometry/types.js'

export type { DrawingLineLabelTarget } from './interaction/impl/interaction.js'
export { DrawingInteractionController } from './interaction/impl/interaction.js'
export {
  MAGNET_RADIUS_STRONG,
  MAGNET_RADIUS_WEAK,
  snapPointerToOhlc,
} from './interaction/impl/magnetSnapper.js'
export {
  DOUBLE_ANCHOR_TOOLS,
  getAnchorCountForTool,
  SINGLE_ANCHOR_TOOLS,
  TRIPLE_ANCHOR_TOOLS,
} from './interaction/impl/toolConfig.js'
export type {
  ActiveMagnetMode,
  DragFollow,
  DrawingDragTarget,
  DrawingSelectionMarquee,
  DrawingToolId,
  HitResult,
  LineLabelTarget,
  MagnetMode,
  MagnetSnapConfig,
  MovingAnchor,
  SnappedPoint,
} from './interaction/types.js'

export { DrawingCommands } from './model/impl/DrawingCommands.js'
export { DrawingDocument } from './model/impl/DrawingDocument.js'
export { DRAWING_LABEL_INDEX_PATTERN, normalizeDrawingLabels } from './model/impl/drawingLabels.js'
export { getDrawingInputAnchorCount } from './model/impl/materializeAnchors.js'
export { resolveDrawingTradingDate } from './model/impl/resolveTradingDate.js'
export type {
  AnchorTradingDateResolution,
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingAnchorCommandInput,
  DrawingCommandsDependencies,
  DrawingCommandsDocumentPort,
  DrawingDocumentDependencies,
  DrawingStyleKey,
  UpdateDrawingPatch,
} from './model/types.js'

export { DrawingDefinitionRegistry } from './render/impl/DrawingDefinitionRegistry.js'
export { DrawingStore } from './render/impl/DrawingStore.js'
export { createArrowDefinition } from './render/impl/definitions/arrow.js'
export {
  createDisjointChannelDefinition,
  createFlatLineDefinition,
  createParallelChannelDefinition,
  createRegressionChannelDefinition,
} from './render/impl/definitions/channels.js'
export { createFibRetracementDefinition } from './render/impl/definitions/fibRetracement.js'
export { registerDefaultDrawingDefinitions } from './render/impl/definitions/index.js'
export { createInfoLineDefinition } from './render/impl/definitions/infoLine.js'
export { createRectangleDefinition } from './render/impl/definitions/rectangle.js'
export { createSingleAnchorLineDefinition } from './render/impl/definitions/singleAnchorLine.js'
export { createTwoPointLineDefinition } from './render/impl/definitions/twoPointLine.js'
export { createDrawingRendererPlugin } from './render/impl/plugin.js'
export { createDefaultPrimitiveRendererSet } from './render/impl/primitiveRendererSet.js'
export type { DrawingStoreDeps, PrimitiveRendererSet } from './render/types.js'

export { clearDrawingSelection, toggleDrawingSelection } from './session/impl/DrawingSelection.js'

/** 图元领域模型契约。 */
export type {
  DrawingAnchorType,
  DrawingComputeContext,
  DrawingDefinition,
  DrawingGeometry,
  DrawingKind,
  DrawingLabel,
  DrawingLabelIndex,
  DrawingLabels,
  DrawingObject,
  DrawingWorkspaceId,
  PersistedDrawingAnchor,
  ResolvedDrawingAnchor,
  ResolvedDrawingObject,
} from './types.js'
