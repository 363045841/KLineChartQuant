/**
 * 数值稳定键编码：把数值规范化为可跨对象比较的字符串 token。
 * 用于指标参数、副图配置等需要稳定序列化身份的键。
 */

/**
 * 将数值编码为稳定的字符串 token，区分 NaN、±Infinity 与 -0。
 * @param value 待编码的数值。
 * @returns 形如 number:1 或 number:NaN 的稳定 token。
 */
export function encodeStableNumber(value: number): string {
  if (Number.isNaN(value)) return 'number:NaN'
  if (value === Number.POSITIVE_INFINITY) return 'number:Infinity'
  if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity'
  if (Object.is(value, -0)) return 'number:-0'
  return `number:${value}`
}
