/**
 * 结构分析（SMC/ICT）模块的公共出口。
 *
 * 契约在 `types.ts`，实现在 `impl/`。实现必须满足三条硬约束（因果性、判据与阈值分离、
 * 可序列化），详见 `types.ts` 头部说明与 `docs/design/structure/structure-contracts.md`。
 *
 * 已实现：因果枢轴（`impl/pivots.ts`）、BOS/CHoCH（`impl/breaks.ts`）、快照装配（`impl/snapshot.ts`）。
 * 未实现：结构区（FVG/OB）、通道状态、量钟、突破评估。
 */

export { detectBreaks } from './impl/breaks.js'
export type { StructureBar } from './impl/pivots.js'
export { detectPivots } from './impl/pivots.js'
export { type BuildStructureSnapshotInput, buildStructureSnapshot } from './impl/snapshot.js'
export type {
  BiasBasis,
  BreachAssessment,
  BreachEvidence,
  BreachProbability,
  BreachRetest,
  BreachSide,
  BreachVerdict,
  BreachVerdictResult,
  BreakDirection,
  BreakKind,
  ChannelKind,
  ChannelOrigin,
  ChannelQuality,
  ChannelState,
  CrossInstrumentAgreement,
  CrossInstrumentConfirmation,
  PivotKind,
  PivotScale,
  PriceBand,
  PriceLine,
  StructureBias,
  StructureBiasState,
  StructureBreak,
  StructurePivot,
  StructureQuality,
  StructureSnapshot,
  StructureSwing,
  StructureZone,
  StructureZoneKind,
  SwingLabel,
  ThresholdProfile,
  ThresholdProvenance,
  VolumeClock,
  VolumeClockSource,
  VolumeProfileSlot,
  ZoneState,
} from './types.js'

export {
  BIAS_BASIS,
  BREACH_SIDE,
  BREACH_VERDICT,
  BREAK_DIRECTION,
  BREAK_KIND,
  CHANNEL_KIND,
  CHANNEL_ORIGIN,
  CROSS_INSTRUMENT_AGREEMENT,
  PIVOT_KIND,
  PIVOT_SCALE,
  STRUCTURE_BIAS,
  STRUCTURE_ZONE_KIND,
  SWING_LABEL,
  THRESHOLD_PROVENANCE,
  VOLUME_CLOCK_SOURCE,
  ZONE_STATE,
} from './types.js'
