/**
 * 指标计算测试的数值序列夹具。
 */

/**
 * 生成等差数列。
 * @param length 序列长度。
 * @param start 首项，默认 1。
 * @param step 公差，默认 1。
 * @returns 等差数列。
 */
export function ramp(length: number, start = 1, step = 1): number[] {
  return Array.from({ length }, (_, index) => start + step * index)
}

/**
 * 生成定值序列。
 * @param length 序列长度。
 * @param value 每项取值。
 * @returns 定值序列。
 */
export function constant(length: number, value: number): number[] {
  return Array.from({ length }, () => value)
}
