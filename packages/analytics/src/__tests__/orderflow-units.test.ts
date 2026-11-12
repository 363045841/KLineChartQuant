/**
 * 单位换算单元测试。
 *
 * 这是多所面板最底层的正确性保证：OKX 下发的深度数量是合约张数，
 * 漏乘 `ctVal` 会让它的深度被低估 100 倍，而分场所净流完全依赖横向比较。
 */
import { describe, expect, it } from 'vitest'
import { notionalOf, toBaseSize } from '../orderflow/impl/units'

describe('toBaseSize', () => {
  it('币数计价的交易所原样返回', () => {
    expect(toBaseSize(2.091, 1)).toBeCloseTo(2.091, 10)
  })

  it('OKX 张数乘合约面值换算成基础币', () => {
    // 实测 BTC-USDT-SWAP 的 ctVal = 0.01 BTC
    expect(toBaseSize(6.78, 0.01)).toBeCloseTo(0.0678, 10)
    // 漏乘会差 100 倍，这个断言就是防止回归
    expect(toBaseSize(6.78, 0.01)).not.toBeCloseTo(6.78, 2)
  })

  it('ETH 的面值口径独立传入，不共用 BTC 常量', () => {
    // 实测 ETH-USDT-SWAP 的 ctVal = 0.1 ETH
    expect(toBaseSize(30, 0.1)).toBeCloseTo(3, 10)
  })

  it('数量为 0 合法', () => {
    expect(toBaseSize(0, 0.01)).toBe(0)
  })

  it('负数数量抛错', () => {
    expect(() => toBaseSize(-1, 1)).toThrowError(/数量非法/)
  })

  it('非有限数量抛错', () => {
    expect(() => toBaseSize(Number.NaN, 1)).toThrowError(/数量非法/)
  })

  it('合约面值为 0 或负数抛错', () => {
    expect(() => toBaseSize(1, 0)).toThrowError(/合约面值非法/)
    expect(() => toBaseSize(1, -0.01)).toThrowError(/合约面值非法/)
  })
})

describe('notionalOf', () => {
  it('数量乘价格', () => {
    expect(notionalOf(0.5, 70000)).toBeCloseTo(35_000, 6)
  })
})
