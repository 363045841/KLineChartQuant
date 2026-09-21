/**
 * 指标类型契约注册表。
 *
 * 这是指标身份与渲染形状的类型单一事实来源：每个指标在此登记一处内部 name → 渲染状态。
 * 计算结果条目形状由本表派生，不再各自手写镜像。
 *
 * 新增内置指标：在对应分组登记 state 类型，并在定义文件注册 @Indicator。
 * 第三方指标可用 declaration merging 扩展对应接口登记内部 name；接口扩展后 @Indicator 即接受该 name。
 */

import type { ALMARenderState } from './state/almaState.js'
import type { ATRRenderState } from './state/atrState.js'
import type { AwesomeOscillatorRenderState } from './state/awesomeOscillatorState.js'
import type { BOLLRenderState } from './state/bollState.js'
import type { CCIRenderState } from './state/cciState.js'
import type { ChaikinVolRenderState } from './state/chaikinVolState.js'
import type { CMFRenderState } from './state/cmfState.js'
import type { DEMARenderState } from './state/demaState.js'
import type { DMARenderState } from './state/dmaState.js'
import type { DonchianRenderState } from './state/donchianState.js'
import type { DPORenderState } from './state/dpoState.js'
import type { ENERenderState } from './state/eneState.js'
import type { EXPMARenderState } from './state/expmaState.js'
import type { FASTKRenderState } from './state/fastkState.js'
import type { FibRenderState } from './state/fibState.js'
import type { FisherTransformRenderState } from './state/fisherTransformState.js'
import type { FRAMARenderState } from './state/framaState.js'
import type { GMMARenderState } from './state/gmmaState.js'
import type { HMARenderState } from './state/hmaState.js'
import type { HVRenderState } from './state/hvState.js'
import type { IchimokuRenderState } from './state/ichimokuState.js'
import type { KAMARenderState } from './state/kamaState.js'
import type { KeltnerRenderState } from './state/keltnerState.js'
import type { KSTRenderState } from './state/kstState.js'
import type { LSMARenderState } from './state/lsmaState.js'
import type { MACDRenderState } from './state/macdState.js'
import type { MARenderState } from './state/maState.js'
import type { MFIRenderState } from './state/mfiState.js'
import type { MOMRenderState } from './state/momState.js'
import type { OBVRenderState } from './state/obvState.js'
import type { ParkinsonRenderState } from './state/parkinsonState.js'
import type { PivotRenderState } from './state/pivotState.js'
import type { PVTRenderState } from './state/pvtState.js'
import type { ROCRenderState } from './state/rocState.js'
import type { RSIRenderState } from './state/rsiState.js'
import type { SARRenderState } from './state/sarState.js'
import type { SchaffTrendCycleRenderState } from './state/schaffTrendCycleState.js'
import type { SMMARenderState } from './state/smmaState.js'
import type { StochRSIRenderState } from './state/stochRSIState.js'
import type { STOCHRenderState } from './state/stochState.js'
import type { StructureRenderState } from './state/structureState.js'
import type { SuperTrendRenderState } from './state/supertrendState.js'
import type { T3RenderState } from './state/t3State.js'
import type { TEMARenderState } from './state/temaState.js'
import type { TRIMARenderState } from './state/trimaState.js'
import type { TRIXRenderState } from './state/trixState.js'
import type { UltimateOscillatorRenderState } from './state/ultimateOscillatorState.js'
import type { VIDYARenderState } from './state/vidyaState.js'
import type { VMARenderState } from './state/vmaState.js'
import type { VolumeProfileRenderState } from './state/volumeProfileState.js'
import type { VWAPRenderState } from './state/vwapState.js'
import type { VWMARenderState } from './state/vwmaState.js'
import type { WMARenderState } from './state/wmaState.js'
import type { WMSRRenderState } from './state/wmsrState.js'
import type { ZLEMARenderState } from './state/zlemaState.js'
import type { ZonesRenderState } from './state/zonesState.js'

/**
 * 带 visibleState 的副图指标契约。
 * 对应运行时注册表中拥有 visibleState.compose 的指标集合。
 */
export interface VisibleIndicatorStateContracts {
  alma: ALMARenderState
  atr: ATRRenderState
  awesomeOscillator: AwesomeOscillatorRenderState
  cci: CCIRenderState
  chaikinVol: ChaikinVolRenderState
  cmf: CMFRenderState
  dema: DEMARenderState
  dma: DMARenderState
  donchian: DonchianRenderState
  dpo: DPORenderState
  fastk: FASTKRenderState
  fib: FibRenderState
  fisherTransform: FisherTransformRenderState
  frama: FRAMARenderState
  gmma: GMMARenderState
  hma: HMARenderState
  hv: HVRenderState
  ichimoku: IchimokuRenderState
  kama: KAMARenderState
  keltner: KeltnerRenderState
  kst: KSTRenderState
  lsma: LSMARenderState
  macd: MACDRenderState
  mfi: MFIRenderState
  mom: MOMRenderState
  obv: OBVRenderState
  parkinson: ParkinsonRenderState
  pivot: PivotRenderState
  pvt: PVTRenderState
  roc: ROCRenderState
  rsi: RSIRenderState
  sar: SARRenderState
  schaffTrendCycle: SchaffTrendCycleRenderState
  smma: SMMARenderState
  stoch: STOCHRenderState
  stochRSI: StochRSIRenderState
  structure: StructureRenderState
  supertrend: SuperTrendRenderState
  t3: T3RenderState
  tema: TEMARenderState
  trima: TRIMARenderState
  trix: TRIXRenderState
  ultimateOscillator: UltimateOscillatorRenderState
  vidya: VIDYARenderState
  vma: VMARenderState
  volumeProfile: VolumeProfileRenderState
  vwap: VWAPRenderState
  vwma: VWMARenderState
  wma: WMARenderState
  wmsr: WMSRRenderState
  zlema: ZLEMARenderState
  zones: ZonesRenderState
}

/** 主图指标契约。对应 mainPane.composeRenderState 的指标集合。 */
export interface MainIndicatorStateContracts {
  ma: MARenderState
  boll: BOLLRenderState
  expma: EXPMARenderState
  ene: ENERenderState
}

/** 全部指标契约（内部 name → 渲染状态）。 */
export interface IndicatorStateContracts
  extends VisibleIndicatorStateContracts,
    MainIndicatorStateContracts {}

/**
 * 通过 @Indicator 注册但不参与结果/状态派生的附属渲染器（数据视图 / 叠加层 / 成交量）。
 * 仅登记内部 name，使 @Indicator 的注册名受编译期约束。
 */
export interface AuxiliaryIndicatorContracts {
  volume: unknown
  timeShare: unknown
  fiveDayTimeShare: unknown
  lastPriceLine: unknown
  lastPriceLabelRegistrar: unknown
  extremaMarkers: unknown
}

/** 参与结果/状态派生的指标内部 name。 */
export type IndicatorStateName = keyof IndicatorStateContracts

/** 可通过 @Indicator 注册的全部内部 name。 */
export type IndicatorName = IndicatorStateName | keyof AuxiliaryIndicatorContracts

/**
 * 指标渲染条目形状：由渲染状态派生计算结果实际携带的字段。
 * 这里给出每个指标条目应有的结构。
 */
export type IndicatorRenderEntry<S> = Pick<
  S,
  Extract<keyof S, 'series' | 'params' | 'enabledPeriods' | 'signalSeries'>
>

/** 指定指标的渲染条目形状。 */
export type IndicatorRenderEntryOf<K extends IndicatorStateName> = IndicatorRenderEntry<
  IndicatorStateContracts[K]
>
