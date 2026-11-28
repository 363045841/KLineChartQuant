/**
 * 图表运行时投影的捕获：把已提交状态整理成一次可比较的快照。
 *
 * 纯读取，不写状态；轴声明由同一份指标、绘图与偏好派生。
 */

import type { DrawingObject } from '@/engine/drawing/index.js'
import { filterDrawingsInScope } from '@/engine/drawing/model/impl/drawingScope.js'
import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity.js'
import {
  AXIS_GROUP_DRAWING,
  AXIS_GROUP_PRICE,
  axisGroupId,
  indicatorAxisGroupKey,
} from '@/engine/pane/axisGroups.js'
import { resolvePaneAxes } from '@/engine/pane/axisResolver.js'
import type { AxisSpec, ObjectAxisSpec } from '@/engine/pane/axisTypes.js'
import { CANDLE_LAYER_ID, PRICE_SERIES_AXIS_ID } from '@/engine/renderers/rendererIds.js'
import { CANDLE_RENDERER_NAME } from '../../renderers/rendererIds.js'
import { formatPlotValue } from '@/engine/plots/impl/plotValueFormat.js'
import type { RuntimeProjectionSnapshot } from '@/engine/runtimeProjection/types.js'
import type { ChartIndicatorManager } from '../../indicators/chartIndicatorManager.js'
import type { DefinitionRegistry } from '../../indicators/registry/index.js'
import type { ChartStateKernel } from '../../state/chartStateKernel.js'
import { resolvePriceScaleTypeSetting } from '../../../foundation/config/chartSettings.js'
import { isTimeShareDataView, resolveChartWorkspaceId } from '../../../foundation/types/chartView.js'
import { ScaleType } from '../../../foundation/types/scaleType.js'
import type { DrawingInteractionController } from '../../drawing/index.js'

/** 投影捕获所需的只读依赖。 */
export interface ChartProjectionDeps {
  readonly kernel: ChartStateKernel
  readonly definitions: DefinitionRegistry
  readonly indicatorManager: ChartIndicatorManager
  readonly getDrawingSession: () => DrawingInteractionController | null
}

/** 捕获一次业务快照；协调者只比较这一份。 */
export function captureChartProjection(deps: ChartProjectionDeps): RuntimeProjectionSnapshot {
  const { kernel } = deps
  const panes = kernel.pane.readonly.paneSpecs()
  const objects = readObjectAxisDeclarations(deps)
  return {
    panes,
    axes: resolvePaneAxes(
      panes.map((pane) => pane.id),
      objects,
      readStandaloneDrawingAxes(deps, panes.map((pane) => pane.id), objects),
    ),
    indicators: deps.indicatorManager.readRuntimeInputs(),
    ranges: kernel.axesState.readonly.paneRanges(),
    pricePaneId: kernel.systemObjects.readonly.pricePaneId(),
    leftAxisVisible: isTimeShareDataView(kernel.mode.readonly.dataView()),
    layoutOptions: kernel.options.readonly.options(),
  }
}

/** 行情序列与指标按量纲声明轴，绘图窗格使用自己的共享轴。 */
function readObjectAxisDeclarations(deps: ChartProjectionDeps): ReadonlyArray<ObjectAxisSpec> {
  const { kernel, definitions } = deps
  const view = kernel.mode.readonly.dataView()
  const pricePaneId = kernel.systemObjects.readonly.pricePaneId()
  const groupAxis = (paneId: string, groupKey: string): string =>
    paneId === pricePaneId && groupKey === AXIS_GROUP_PRICE
      ? PRICE_SERIES_AXIS_ID
      : axisGroupId(paneId, groupKey)
  const indicatorAxes = [...kernel.indicator.readonly.instances()]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((instance) => {
      const definition = definitions.getDefinition(instance.indicatorId)
      const groupKey =
        definition?.category === 'main'
          ? AXIS_GROUP_PRICE
          : indicatorAxisGroupKey(instance.indicatorId)
      return {
        objectId: instance.instanceId,
        paneId: instance.paneId,
        axisId: groupAxis(instance.paneId, groupKey),
        visible: instance.hidden !== true,
        decimals: definition?.scale?.decimals ?? 2,
        format:
          definition?.scale?.format ??
          (definition?.plots?.format && definition.plots.format !== 'price'
            ? ((format) => (value: number) => formatPlotValue(format, value))(
                definition.plots.format,
              )
            : undefined),
      }
    })
  const seriesState = kernel.systemObjects.readonly.state()
  const objectAxes = [
    {
      objectId: CANDLE_LAYER_ID,
      paneId: pricePaneId,
      axisId: PRICE_SERIES_AXIS_ID,
      decimals: 2,
      visible: !seriesState.hidden.includes(CANDLE_RENDERER_NAME),
    },
    ...indicatorAxes,
  ]
  const preferences = kernel.pane.readonly.paneScaleTypes()
  // 未保存逐轴偏好时，主价格轴由用户设置决定；其它量纲组默认线性。
  const priceScaleType =
    preferences.get(PRICE_SERIES_AXIS_ID) ??
    resolvePriceScaleTypeSetting(kernel.settings.readonly.settings().mainRightAxisTypeSetting)
  const percentView = isTimeShareDataView(view) || kernel.comparison.readonly.active()
  return objectAxes.map((axis) => ({
    ...axis,
    scaleType:
      axis.axisId === PRICE_SERIES_AXIS_ID
        ? percentView
          ? ScaleType.Percent
          : priceScaleType
        : (preferences.get(axis.axisId) ?? ScaleType.Linear),
  }))
}

/** 仅承载绘图的窗格声明自己的共享轴。 */
function readStandaloneDrawingAxes(
  deps: ChartProjectionDeps,
  paneIds: readonly string[],
  objects: readonly ObjectAxisSpec[],
): readonly AxisSpec[] {
  const { kernel } = deps
  const dataPanes = new Set(objects.map((object) => object.paneId))
  const standalonePanes = paneIds.filter((paneId) => !dataPanes.has(paneId))
  if (standalonePanes.length === 0) return []
  const spec = kernel.dataManager.readonly.currentSpec()
  const drawings: DrawingObject[] = [
    ...new Map(
      [
        ...kernel.drawing.readonly.drawings(),
        ...(deps.getDrawingSession()?.getPaintOverlay() ?? []),
      ].map((drawing) => [drawing.id, drawing]),
    ).values(),
  ]
  const scope = {
    workspaceId: resolveChartWorkspaceId(kernel.mode.readonly.dataView()),
    symbolKey: spec === null ? undefined : symbolSpecIdentityKey(spec),
    period: kernel.mode.readonly.lastBarPeriod(),
  }
  const preferences = kernel.pane.readonly.paneScaleTypes()
  return standalonePanes.flatMap((paneId) => {
    const scoped = filterDrawingsInScope(drawings, { ...scope, paneId })
    if (scoped.length === 0) return []
    const axisId = axisGroupId(paneId, AXIS_GROUP_DRAWING)
    return [
      {
        paneId,
        axisId,
        decimals: 2,
        visible: scoped.some((drawing) => drawing.visible),
        scaleType: preferences.get(axisId) ?? ScaleType.Linear,
      },
    ]
  })
}
