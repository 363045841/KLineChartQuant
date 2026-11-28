/**
 * 装配器与图表实例之间的宿主端口。
 *
 * 只声明装配阶段必须回调的宿主能力：投影输入、渲染器访问、运动停止与生命周期。
 * 端口按需增长，不允许把整个 Chart 传进来。
 */

import type { ChartOptions } from '../types.js'
import type { PaneSpec } from '../../pane/types.js'
import type { ChartSettings } from '../../../foundation/config/chartSettings.js'
import type { ReadonlySignal, WritableSignal } from '../../../foundation/reactivity/signal.js'
import type { UpdateLevel, PaneRenderer } from '../../pane/index.js'
import type { Layer, RenderObjectCommands } from '../../../rendering/scene/types.js'
import type { RenderContext } from '../../../foundation/plugin/index.js'
import type { RuntimeProjectionSnapshot } from '../../runtimeProjection/types.js'
import type { ChartModeHandler } from '../../chartModel/index.js'
import type { DrawingInteractionController } from '../../drawing/index.js'
import type { InteractionController } from '../../controller/interaction.js'
import type { AxisWidths } from '../../axisWidth/types.js'
import type { ChartStateKernel } from '../../state/chartStateKernel.js'

/** 渲染与布局共享的当前选项投影。 */
export type ChartRenderOptions = ChartOptions & {
  readonly kWidth: number
  readonly kGap: number
}

/** 装配阶段可用的宿主能力。 */
export interface ChartGraphHost {
  /** 创建时的初始缩放级别。 */
  initialZoomLevel(): number
  scheduleDraw(level?: UpdateLevel): void
  getRenderOptions(): ChartRenderOptions
  getOption(): Readonly<Omit<ChartOptions, 'panes'>> & { readonly panes?: readonly PaneSpec[] }
  getRenderer(id: string): Layer<RenderContext> | undefined
  useRenderer(layer: Layer<RenderContext>): void
  removeRenderer(id: string): void
  requestRender(): void
  commitAxisWidths(widths: AxisWidths): boolean
  commitPendingLayout(): void
  /** 取消进行中的绘图会话。 */
  cancelDrawingSession(): void
  /** 允许下一帧重新评估轴宽。 */
  unlockAxisWidth(): void
  createIndicatorObjectCommands(instanceId: string): RenderObjectCommands
  captureRuntimeProjection(): RuntimeProjectionSnapshot
  paneRenderers(): PaneRenderer[]
  paneRenderer(paneId: string): PaneRenderer | undefined
  computeActiveRangePreset(): import('../../viewport/rangePreset.js').RangePreset | null
  projectSettings(previous: Readonly<ChartSettings>, next: Readonly<ChartSettings>): void
  startRuntime(): void
  activeMode(): ChartModeHandler
  panTo(scroll: number): boolean
  finishNavigation(): void
  clearDrawingHover(): void
  getLeftLoadBufferWidth(): number
  setComparisonSpecs(specs: ReadonlyArray<import('../../../data/symbolSpec.js').SymbolSpec>): void
  /** 最近一次序列切换失败原因。 */
  readonly selectionError: WritableSignal<string | null>
  /** 图层可见性投影版本。 */
  readonly layerRevision: ReadonlySignal<number>
  drawingSession(): DrawingInteractionController | null
  getInteraction(): InteractionController
  /** 以图表实例作为交互宿主创建控制器。 */
  createInteraction(kernel: ChartStateKernel): InteractionController
}
