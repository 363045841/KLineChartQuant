/**
 * State Composer
 * 把 Worker/Runtime 返回的 series bundle 组装成与现有兼容的 render states
 */

import type {
    MARenderState,
} from './maState'
import type {
    BOLLRenderState,
} from './bollState'
import type {
    EXPMARenderState,
} from './expmaState'
import type {
    ENERenderState,
} from './eneState'
import type {
    RSIRenderState,
} from './rsiState'
import type {
    CCIRenderState,
} from './cciState'
import type {
    STOCHRenderState,
} from './stochState'
import type {
    MOMRenderState,
} from './momState'
import type {
    WMSRRenderState,
} from './wmsrState'
import type {
    KSTRenderState,
} from './kstState'
import type {
    FASTKRenderState,
} from './fastkState'
import type {
    MACDRenderState,
} from './macdState'
import type {
    ATRRenderState,
} from './atrState'
import type { WMARenderState } from './wmaState'
import type { DEMARenderState } from './demaState'
import type { TEMARenderState } from './temaState'
import type { HMARenderState } from './hmaState'
import type { KAMARenderState } from './kamaState'
import type { SARRenderState } from './sarState'
import type { SuperTrendRenderState } from './supertrendState'
import type { KeltnerRenderState } from './keltnerState'
import type { DonchianRenderState } from './donchianState'
import type { IchimokuRenderState } from './ichimokuState'
import type { ROCRenderState } from './rocState'
import type { TRIXRenderState } from './trixState'
import type { HVRenderState } from './hvState'
import type { ParkinsonRenderState } from './parkinsonState'
import type { ChaikinVolRenderState } from './chaikinVolState'
import type { VMARenderState } from './vmaState'
import type { OBVRenderState } from './obvState'
import type { PVTRenderState } from './pvtState'
import type { VWAPRenderState } from './vwapState'
import type { CMFRenderState } from './cmfState'
import type { MFIRenderState } from './mfiState'
import type { PivotRenderState } from './pivotState'
import type { FibRenderState } from './fibState'
import type { StructureRenderState } from './structureState'
import type { ZonesRenderState } from './zonesState'
import type { VolumeProfileRenderState } from './volumeProfileState'
import type { IndicatorSeriesBundle } from './workerProtocol'
import type { IndicatorMetadata } from './indicatorMetadata'

/**
 * 可见范围
 */
interface VisibleRange {
    start: number
    end: number
}

type VisibleSubIndicatorStates = {
    rsi: RSIRenderState
    cci: CCIRenderState
    stoch: STOCHRenderState
    mom: MOMRenderState
    wmsr: WMSRRenderState
    kst: KSTRenderState
    fastk: FASTKRenderState
    macd: MACDRenderState
    atr: ATRRenderState
    wma: WMARenderState
    dema: DEMARenderState
    tema: TEMARenderState
    hma: HMARenderState
    kama: KAMARenderState
    sar: SARRenderState
    supertrend: SuperTrendRenderState
    keltner: KeltnerRenderState
    donchian: DonchianRenderState
    ichimoku: IchimokuRenderState
    roc: ROCRenderState
    trix: TRIXRenderState
    hv: HVRenderState
    parkinson: ParkinsonRenderState
    chaikinVol: ChaikinVolRenderState
    vma: VMARenderState
    obv: OBVRenderState
    pvt: PVTRenderState
    vwap: VWAPRenderState
    cmf: CMFRenderState
    mfi: MFIRenderState
    pivot: PivotRenderState
    fib: FibRenderState
    structure: StructureRenderState
    zones: ZonesRenderState
    volumeProfile: VolumeProfileRenderState
}

type VisibleSubIndicatorMask = {
    rsi?: boolean
    cci?: boolean
    stoch?: boolean
    mom?: boolean
    wmsr?: boolean
    kst?: boolean
    fastk?: boolean
    macd?: boolean
    atr?: boolean
    wma?: boolean
    dema?: boolean
    tema?: boolean
    hma?: boolean
    kama?: boolean
    sar?: boolean
    supertrend?: boolean
    keltner?: boolean
    donchian?: boolean
    ichimoku?: boolean
    roc?: boolean
    trix?: boolean
    hv?: boolean
    parkinson?: boolean
    chaikinVol?: boolean
    vma?: boolean
    obv?: boolean
    pvt?: boolean
    vwap?: boolean
    cmf?: boolean
    mfi?: boolean
    pivot?: boolean
    fib?: boolean
    structure?: boolean
    zones?: boolean
    volumeProfile?: boolean
}

type MainRenderStates = {
    ma: MARenderState
    boll: BOLLRenderState
    expma: EXPMARenderState
    ene: ENERenderState
}

type MainRenderStateIndicatorId = keyof MainRenderStates

type ComposedRenderStates = VisibleSubIndicatorStates & MainRenderStates

const MAIN_RENDER_STATE_INDICATOR_IDS: readonly MainRenderStateIndicatorId[] = ['ma', 'boll', 'expma', 'ene']
const METADATA_VISIBLE_STATE_INDICATOR_IDS = [
    'cci',
    'wma',
    'dema',
    'tema',
    'hma',
    'kama',
    'roc',
    'chaikinVol',
    'obv',
    'pvt',
    'vwap',
    'rsi',
    'stoch',
    'fastk',
    'mfi',
    'wmsr',
    'cmf',
    'atr',
    'hv',
    'kst',
    'mom',
    'parkinson',
    'trix',
    'vma',
    'macd',
    'sar',
    'supertrend',
    'keltner',
    'donchian',
    'ichimoku',
    'pivot',
    'fib',
    'structure',
    'zones',
    'volumeProfile',
] as const satisfies readonly (keyof VisibleSubIndicatorStates)[]

type _MissingVisibleStateId = Exclude<
    keyof VisibleSubIndicatorStates,
    typeof METADATA_VISIBLE_STATE_INDICATOR_IDS[number]
>
type _ExtraVisibleStateId = Exclude<
    typeof METADATA_VISIBLE_STATE_INDICATOR_IDS[number],
    keyof VisibleSubIndicatorStates
>
type AssertNever<T extends never> = T
type _AssertNoMissingId = AssertNever<_MissingVisibleStateId>
type _AssertNoExtraId = AssertNever<_ExtraVisibleStateId>

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

    for (const indicatorId of METADATA_VISIBLE_STATE_INDICATOR_IDS) {
        states[indicatorId] = composeRequiredMetadataVisibleState(
            indicatorId, bundle, visibleRange, timestamp, activeMask, getIndicatorMetadata,
        ) as never
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
    const subStates = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, {}, getIndicatorMetadata)

    return {
        ...mainStates,
        ...subStates,
    }
}

function composeRequiredMetadataVisibleState(
    indicatorId: keyof VisibleSubIndicatorStates,
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    timestamp: number,
    activeMask: VisibleSubIndicatorMask,
    getIndicatorMetadata: (indicatorId: string) => IndicatorMetadata | undefined,
): unknown {
    const meta = getIndicatorMetadata(indicatorId)
    if (!meta) return undefined

    const compose = meta.visibleState?.compose
    if (!compose) {
        throw new Error(`[StateComposer] Missing visibleState.compose for ${indicatorId}`)
    }

    return compose({
        bundle,
        visibleRange,
        timestamp,
        active: activeMask[indicatorId] ?? true,
    })
}

function composeMainRenderStates(
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    timestamp: number,
    getIndicatorMetadata: (indicatorId: string) => IndicatorMetadata | undefined,
): MainRenderStates {
    const states: Partial<Record<MainRenderStateIndicatorId, unknown>> = {}

    for (const indicatorId of MAIN_RENDER_STATE_INDICATOR_IDS) {
        const definition = getIndicatorMetadata(indicatorId)
        if (!definition) continue

        const composeRenderState = definition.mainPane?.composeRenderState
        if (!composeRenderState) {
            throw new Error(`[StateComposer] Missing mainPane.composeRenderState for ${indicatorId}`)
        }
        states[indicatorId] = composeRenderState(bundle, visibleRange, timestamp)
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
        const range = getIndicatorMetadata(indicatorId)?.mainPane?.computePriceRange?.(bundle, visibleRange)
        if (!range) continue
        min = Math.min(min, range.min)
        max = Math.max(max, range.max)
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null
    }

    return { min, max }
}
