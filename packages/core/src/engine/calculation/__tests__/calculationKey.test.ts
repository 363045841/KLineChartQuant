/**
 * 计算身份编码：稳定地区分行情与计算输入。
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

  it.each([
    ['字符串和数字', '1', 1],
    ['数组和对象', [1, 2], { 0: 1, 1: 2 }],
  ])('区分%s', (_label, left, right) => {
    expect(canonicalizeInput(left)).not.toBe(canonicalizeInput(right))
  })

  it.each([Number.NaN, Infinity, -Infinity])('拒绝非有限数字 %s', (value) => {
    expect(() => canonicalizeInput(value)).toThrow(TypeError)
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
