/**
 * State Composer
 * 把 Worker/Runtime 返回的 series bundle 组装成与现有兼容的 render states
 */

import { KLineChartError } from '../../errors.js'
import type { KLineData } from '../../foundation/types/price.js'
import type {
  ComposedRenderStates,
  MainIndicatorName,
  MainRenderStates,
  VisibleIndicatorName,
  VisibleSubIndicatorMask,
  VisibleSubIndicatorStates,
} from './indicatorContracts.js'
import { getRegisteredIndicatorDefinitions } from './indicatorDefinitionRegistry.js'
import type { IndicatorMetadata } from './indicatorMetadata.js'
import type { IndicatorSeriesBundle } from './workerProtocol.js'

/**
 * 可见范围
 */
interface VisibleRange {
  start: number
  end: number
}

/** 按契约键写入副图状态，保持键与状态类型的对应关系。 */
function setVisibleSubIndicatorState<K extends VisibleIndicatorName>(
  states: Partial<VisibleSubIndicatorStates>,
  indicatorId: K,
  state: VisibleSubIndicatorStates[K] | undefined,
): void {
  states[indicatorId] = state
}

/** 当前注册表中拥有 visibleState.compose 的指标内部 name。 */
function getVisibleStateIndicatorIds(): VisibleIndicatorName[] {
  return getRegisteredIndicatorDefinitions()
    .filter((definition) => !!definition.visibleState?.compose)
    .map((definition) => definition.name as VisibleIndicatorName)
}

/**
 * 仅计算副图指标的 visible-only states
 * 用于滚动时的轻量更新，避免重复计算主图指标
 */
export function composeVisibleSubIndicatorStates(
  bundle: IndicatorSeriesBundle,
  visibleRange: VisibleRange,
  timestamp: number,
  activeMask: VisibleSubIndicatorMask = {},
  getIndicatorMetadata: (indicatorId: string) => IndicatorMetadata | undefined,
): VisibleSubIndicatorStates {
  const states: Partial<VisibleSubIndicatorStates> = {}

  for (const indicatorId of getVisibleStateIndicatorIds()) {
    setVisibleSubIndicatorState(
      states,
      indicatorId,
      composeRequiredMetadataVisibleState(
        indicatorId,
        bundle,
        visibleRange,
        timestamp,
        activeMask,
        getIndicatorMetadata,
      ),
    )
  }

  return states as VisibleSubIndicatorStates
}

/**
 * 从 series bundle 组装所有 render states
 * 同时计算 visibleMin/visibleMax 等派生字段
 */
export function composeRenderStates(
  bundle: IndicatorSeriesBundle,
  visibleRange: VisibleRange,
  timestamp: number,
  getIndicatorMetadata: (indicatorId: string) => IndicatorMetadata | undefined,
): ComposedRenderStates {
  const mainStates = composeMainRenderStates(bundle, visibleRange, timestamp, getIndicatorMetadata)
  const subStates = composeVisibleSubIndicatorStates(
    bundle,
    visibleRange,
    timestamp,
    {},
    getIndicatorMetadata,
  )

  return {
    ...mainStates,
    ...subStates,
  }
}

/** 成交量副图的帧级渲染状态。 */
export interface VolumeRenderState {
  readonly timestamp: number
  readonly valueMin: number
  readonly valueMax: number
}

/** 根据当前可见 K 线计算成交量坐标轴范围。 */
export function composeVolumeRenderState(
  data: ReadonlyArray<KLineData>,
  visibleRange: VisibleRange,
  timestamp: number,
): VolumeRenderState | null {
  let maxVolume = 0
  let minVolume = Infinity
  const end = Math.min(visibleRange.end, data.length)
  for (let index = visibleRange.start; index < end; index++) {
    const volume = data[index]?.volume
    if (volume === undefined || volume === null) continue
    maxVolume = Math.max(maxVolume, volume)
    minVolume = Math.min(minVolume, volume)
  }
  if (maxVolume === 0 || !Number.isFinite(minVolume)) return null

  const padding = Math.max(0.05, (maxVolume - minVolume) * 0.1)
  return {
    timestamp,
    valueMin: Math.max(0, minVolume - padding),
    valueMax: maxVolume + padding,
  }
}

function composeRequiredMetadataVisibleState<K extends VisibleIndicatorName>(
  indicatorId: K,
  bundle: IndicatorSeriesBundle,
  visibleRange: VisibleRange,
  timestamp: number,
  activeMask: VisibleSubIndicatorMask,
  getIndicatorMetadata: (indicatorId: string) => IndicatorMetadata | undefined,
): VisibleSubIndicatorStates[K] | undefined {
  const meta = getIndicatorMetadata(indicatorId)
  if (!meta) return undefined

  const compose = meta.visibleState?.compose
  if (!compose) {
    throw new KLineChartError(
      'NOT_REGISTERED',
      `[StateComposer] Missing visibleState.compose for ${indicatorId}`,
    )
  }

  // 元数据以 unknown 持有异构状态，契约注册表给出该键对应的状态类型。
  return compose({
    bundle,
    visibleRange,
    timestamp,
    active: activeMask[indicatorId] ?? true,
  }) as VisibleSubIndicatorStates[K]
}

/** 按契约键写入主图状态。 */
function setMainRenderState<K extends MainIndicatorName>(
  states: Partial<MainRenderStates>,
  indicatorId: K,
  state: MainRenderStates[K],
): void {
  states[indicatorId] = state
}

function composeMainRenderStates(
  bundle: IndicatorSeriesBundle,
  visibleRange: VisibleRange,
  timestamp: number,
  getIndicatorMetadata: (indicatorId: string) => IndicatorMetadata | undefined,
): MainRenderStates {
  const states: Partial<MainRenderStates> = {}

  for (const def of getRegisteredIndicatorDefinitions()) {
    if (!def.mainPane?.composeRenderState) continue
    const indicatorId = def.name as MainIndicatorName
    const meta = getIndicatorMetadata(indicatorId)
    const compose = meta?.mainPane?.composeRenderState ?? def.mainPane.composeRenderState
    if (!compose) continue
    setMainRenderState(
      states,
      indicatorId,
      compose(bundle, visibleRange, timestamp) as MainRenderStates[MainIndicatorName],
    )
  }

  return states as MainRenderStates
}

/**
 * 计算主图指标价格范围
 * 用于 Chart.draw() 中的 pane.updateRange
 */
export function computeMainIndicatorPriceRange(
  bundle: IndicatorSeriesBundle,
  visibleRange: VisibleRange,
  activeMainIndicators: Set<string>,
  getIndicatorMetadata: (indicatorId: string) => IndicatorMetadata | undefined,
): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity

  for (const indicatorId of activeMainIndicators) {
    const range = getIndicatorMetadata(indicatorId)?.mainPane?.computePriceRange?.(
      bundle,
      visibleRange,
    )
    if (!range) continue
    min = Math.min(min, range.min)
    max = Math.max(max, range.max)
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null
  }

  return { min, max }
}
