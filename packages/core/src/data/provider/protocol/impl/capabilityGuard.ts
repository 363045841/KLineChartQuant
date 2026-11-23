/**
 * 协议能力声明校验：只守会让消费方抛错或污染请求的字段，其余字段按声明透传。
 * 类型写错最多让该源少一个候选，不值得让整份声明作废；旧方言也不翻译、不补缺省值。
 */
import type { InstrumentCapabilities, SourceCapabilities } from '../../types.js'
import type { ProtocolInstrumentCapabilities, ProtocolSourceCapabilities } from '../types.js'

/** 能力声明不可用时对外说明的原因；宿主据此判断该源不参与流转。 */
export const UNUSABLE_CAPABILITIES_MESSAGE = '能力声明不符合协议，已按不可用处理'

/** 只接受普通对象：null、数组和标量都不是能力声明。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 是否有限数；NaN 与 Infinity 进入比较或请求体后会把错误扩散到下游。 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** K 线能力：periods/adjustments 由 .includes 读取，单页上限参与 Math.min。 */
function isBarCapability(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.periods) &&
    Array.isArray(value.adjustments) &&
    (value.maxBarsPerRequest === undefined || isFiniteNumber(value.maxBarsPerRequest))
  )
}

/** 多日分时能力：可查询天数参与比较。 */
function isTimeShareRangeCapability(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.maxTradingDays)
}

/** 参与筛选与请求的字段形状；未列出的字段不校验。 */
function hasUsableShapes(value: Record<string, unknown>): boolean {
  return (
    (value.bars === undefined || isBarCapability(value.bars)) &&
    (value.timeShareRange === undefined || isTimeShareRangeCapability(value.timeShareRange))
  )
}

/**
 * 读取品种级能力声明。
 * @param value 网络响应中的能力字段，未经类型系统保证
 * @returns 合法的能力声明；能力整体缺失或形状不合协议时返回 undefined
 */
export function readInstrumentCapabilities(
  value: ProtocolInstrumentCapabilities | undefined,
): InstrumentCapabilities | undefined {
  return isRecord(value) && hasUsableShapes(value) ? value : undefined
}

/**
 * 读取源级能力声明。
 * instrumentTypes 是流转筛选的必需条件，缺失或非数组时该源无法参与品种匹配。
 * @param value 网络响应中的能力字段，未经类型系统保证
 * @returns 合法的源级能力声明；缺失 instrumentTypes 或形状不合协议时返回 undefined
 */
export function readSourceCapabilities(
  value: ProtocolSourceCapabilities | undefined,
): SourceCapabilities | undefined {
  return isRecord(value) && Array.isArray(value.instrumentTypes) && hasUsableShapes(value)
    ? value
    : undefined
}
