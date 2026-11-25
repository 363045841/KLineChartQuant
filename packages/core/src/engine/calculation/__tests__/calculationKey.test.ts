/**
 * 计算身份编码：稳定、无碰撞、视口按需进入身份。
 */

import { describe, expect, it } from 'vitest'

import {
  canonicalizeInput,
  createCalculationKey,
  createDataIdentity,
  createFeedKey,
  createLocalCalculationKey,
} from '../index.js'

describe('canonicalizeInput', () => {
  it('按排序键编码对象，不受键顺序影响', () => {
    expect(canonicalizeInput({ b: 2, a: 1 })).toBe(canonicalizeInput({ a: 1, b: 2 }))
  })

  it('区分类型与嵌套结构', () => {
    expect(canonicalizeInput('1')).not.toBe(canonicalizeInput(1))
    expect(canonicalizeInput([1, 2])).not.toBe(canonicalizeInput({ 0: 1, 1: 2 }))
  })

  it('拒绝非有限数字', () => {
    expect(() => canonicalizeInput(Number.NaN)).toThrow(TypeError)
  })
})

describe('createLocalCalculationKey', () => {
  const base = {
    definitionId: 'ma',
    inputs: { length: 20 },
    context: { revision: 1 },
  }

  it('相同输入产生同一键', () => {
    expect(createLocalCalculationKey(base)).toBe(createLocalCalculationKey({ ...base }))
  })

  it('视口只在显式提供时进入身份', () => {
    const without = createLocalCalculationKey(base)
    const fixed = createLocalCalculationKey({ ...base, viewportKey: 'fixed:200' })
    expect(fixed).not.toBe(without)
    expect(createLocalCalculationKey({ ...base, viewportKey: 'fixed:200' })).toBe(fixed)
  })
})

describe('feed identity', () => {
  it('数据身份键与字段一一对应', () => {
    const identity = createDataIdentity({
      source: 'binance',
      instrument: 'BTCUSDT',
      period: '1h',
      adjustment: 'none',
      defaultPeriod: '1d',
      defaultAdjustment: 'none',
    })
    expect(createFeedKey(identity)).toBe(
      JSON.stringify(['binance', 'BTCUSDT', '1h', 'none']),
    )
  })

  it('全局键区分 feed，本地键在不同 feed 下可重复', () => {
    const local = createLocalCalculationKey({
      definitionId: 'ma',
      inputs: {},
      context: {},
    })
    expect(createCalculationKey('a', local)).not.toBe(createCalculationKey('b', local))
  })
})
