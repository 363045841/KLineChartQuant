/** 计算任务键稳定表达输入类型与所属序列。 */
import { expect, it } from 'vitest'
import { canonicalizeInput, createCalculationKey, createLocalCalculationKey } from '../index.js'

it('canonicalizes object keys independently of declaration order', () => {
  expect(canonicalizeInput({ b: 2, a: 1 })).toBe(canonicalizeInput({ a: 1, b: 2 }))
})

it.each([
  ['string and number', '1', 1],
  ['array and object', [1, 2], { 0: 1, 1: 2 }],
] as const)('distinguishes %s', (_label, left, right) => {
  expect(canonicalizeInput(left)).not.toBe(canonicalizeInput(right))
})

it.each([NaN, Infinity, -Infinity])('rejects %s', (value) => {
  expect(() => canonicalizeInput(value)).toThrow(TypeError)
})

it('scopes identical tasks by series', () => {
  const local = createLocalCalculationKey({ definitionId: 'ma', inputs: {} })
  expect(createCalculationKey('a', local)).not.toBe(createCalculationKey('b', local))
})
