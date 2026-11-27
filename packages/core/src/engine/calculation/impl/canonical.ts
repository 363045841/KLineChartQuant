/**
 * 计算身份的确定性编码。
 *
 * 只接受可 JSON 表达的值；拒绝非有限数字与非 JSON 结构，禁止静默碰撞。
 */
import type {
  CalculationInputObject,
  CalculationInputValue,
  CalculationRequest,
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

/** 同一序列上的计算由定义与输入唯一决定。 */
export function createLocalCalculationKey(
  request: Pick<CalculationRequest, 'definitionId' | 'inputs'>,
): string {
  if (!request.definitionId) throw new TypeError('Calculation definitionId is required')
  return `${JSON.stringify(request.definitionId)}:${canonicalizeInput(request.inputs)}`
}

/** 全局结果键；feed 与消费者本地键拼接，跨数据源不会串结果。 */
export function createCalculationKey(feed: string, localKey: string): string {
  return `${feed}\u0000${localKey}`
}
