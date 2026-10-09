/** 十进制定点运算；只在绘制边界转换浮点数，不用浮点除法决定价格档位。 */
export interface Decimal {
  readonly units: bigint
  readonly scale: number
}

/** 解析有限非负十进制字符串，并支持品种步长的科学计数法。 */
export function parseDecimal(text: string): Decimal {
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!match) throw new TypeError(`Invalid decimal: ${text}`)
  const fraction = match[2] ?? ''
  const scale = fraction.length - Number(match[3] ?? 0)
  if (!Number.isSafeInteger(scale) || Math.abs(scale) > 30)
    throw new RangeError('Decimal scale exceeds precision budget')
  const units = BigInt(`${match[1]}${fraction}`)
  return scale < 0 ? { units: units * 10n ** BigInt(-scale), scale: 0 } : { units, scale }
}

/** 将十进制数提升到统一精度，不舍入数量。 */
export function decimalUnits(value: Decimal, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale)
}

/** 定点相乘；scale 相加，得到两数的精确乘积，用于价 × 量。 */
export function multiplyDecimal(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale }
}

/** 输出标准十进制字符串，保留整数运算的准确结果。 */
export function formatDecimal(units: bigint, scale: number): string {
  const sign = units < 0n ? '-' : ''
  const digits = (units < 0n ? -units : units).toString().padStart(scale + 1, '0')
  if (scale === 0) return sign + digits
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return `${sign}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`
}
