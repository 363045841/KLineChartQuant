/**
 * 价格空间换算：把价格按当前坐标轴的度量映射到可做算术的空间，再映射回价格。
 *
 * 对数轴上「等距」是等比例而不是等差价，通道平移、斜率取反与回归拟合都必须在
 * 对数空间完成后转回价格，否则图形在屏幕上不等距、回归线也不是屏幕直线。
 */

import { ScaleType } from '@/foundation/types/scaleType.js'
import type { PriceSpace } from '../types.js'

/**
 * 价格 → 运算空间的值。
 *
 * 对数轴返回价格的自然对数；与坐标轴使用的 `log10(price) + 常量` 只差一个正的
 * 常数因子，等距、斜率相反数这类仿射不变的性质不受影响。非正价格在对数轴无法
 * 表示，返回 NaN，由调用方按「无法计算」处理，不做隐式降级。
 * @param value 价格
 * @param space 运算空间
 * @returns 空间内的值；对数空间下非正价格为 NaN
 */
export function toPriceSpace(value: number, space: PriceSpace): number {
  return space === 'log' ? Math.log(value) : value
}

/**
 * 运算空间的值 → 价格。
 * @param value 空间内的值
 * @param space 运算空间
 * @returns 价格
 */
export function fromPriceSpace(value: number, space: PriceSpace): number {
  return space === 'log' ? Math.exp(value) : value
}

/**
 * 把价格按空间内的增量平移，再转回价格。
 * @param value 价格
 * @param delta 空间内的增量（对数轴为对数差，等价于乘除一个比例）
 * @param space 运算空间
 * @returns 平移后的价格；无法换算时为 NaN
 */
export function offsetPriceInSpace(value: number, delta: number, space: PriceSpace): number {
  return fromPriceSpace(toPriceSpace(value, space) + delta, space)
}

/**
 * 坐标轴类型 → 运算空间。
 * @param scaleType 坐标轴类型
 * @returns 对数轴为 'log'，其余（线性、百分比）按价格本身运算
 */
export function priceSpaceOf(scaleType: ScaleType): PriceSpace {
  return scaleType === ScaleType.Log ? 'log' : 'price'
}
