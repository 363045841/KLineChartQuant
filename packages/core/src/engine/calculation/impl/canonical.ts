/**
 * 计算身份的确定性编码。
 *
 * 只接受可 JSON 表达的值；拒绝非有限数字与非 JSON 结构，禁止静默碰撞。
 */
import type {
  CalculationInputObject,
  CalculationInputValue,
  CalculationRequest,
  DataIdentity,
} from '../types.js'

/** 判断是否为输入数组；显式谓词用于收窄 readonly 数组。 */
function isInputArray(
  value: CalculationInputObject | readonly CalculationInputValue[],
): value is readonly CalculationInputValue[] {
  return Array.isArray(value)
}

/** 按键名排序编码输入对象，保证同一输入集合产生同一字符串。 */
function canonicalizeObject(value: CalculationInputObject): string {
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeInput(value[key]!)}`)
    .join(',')}}`
}

/** 把输入值编码为稳定字符串；不支持的值直接拒绝。 */
export function canonicalizeInput(value: CalculationInputValue): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Calculation inputs must be finite')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (isInputArray(value)) return `[${value.map(canonicalizeInput).join(',')}]`
  return canonicalizeObject(value)
}

/** 由数据字段构造稳定身份；缺省值只在这里归一。 */
export function createDataIdentity(input: {
  readonly source: string
  readonly instrument: string
  readonly period?: string
  readonly adjustment?: string
  readonly defaultPeriod: string
  readonly defaultAdjustment: string
}): DataIdentity {
  if (!input.source) throw new TypeError('Data identity requires a source')
  if (!input.instrument) throw new TypeError('Data identity requires an instrument')
  if (!input.defaultPeriod) throw new TypeError('Data identity requires a default period')
  if (!input.defaultAdjustment)
    throw new TypeError('Data identity requires a default adjustment')
  return Object.freeze({
    source: input.source,
    instrument: input.instrument,
    period: input.period ?? input.defaultPeriod,
    adjustment: input.adjustment ?? input.defaultAdjustment,
  })
}

/** 行情序列键；与视图无关。 */
export function createFeedKey(identity: DataIdentity): string {
  return JSON.stringify([
    identity.source,
    identity.instrument,
    identity.period,
    identity.adjustment,
  ])
}

/**
 * 消费者内部的计算键。
 *
 * 视口只在请求显式声明时进入身份；不依赖视图的脚本永远得到同一个键。
 */
export function createLocalCalculationKey(
  request: Pick<
    CalculationRequest,
    'definitionId' | 'inputs' | 'context' | 'viewportKey'
  >,
): string {
  if (!request.definitionId) throw new TypeError('Calculation definitionId is required')
  const viewport =
    request.viewportKey === undefined ? '' : `:${canonicalizeInput(request.viewportKey)}`
  return `${request.definitionId}:${canonicalizeInput(request.inputs)}:${canonicalizeInput(
    request.context,
  )}${viewport}`
}

/** 全局结果键；feed 与消费者本地键拼接，跨数据源不会串结果。 */
export function createCalculationKey(feed: string, localKey: string): string {
  return `${feed}\u0000${localKey}`
}
