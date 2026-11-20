/** 计算依赖与重算区间：纯函数，覆盖有状态、无界回看与有界回看的扩边。 */
import { describe, expect, it } from 'vitest'
import {
  type ComputeChange,
  type ComputeDependency,
  resolveComputeRange,
  STATEFUL,
  stateless,
} from '../compute.js'

/** 一行重算区间的输入与期望。 */
interface RangeCase {
  readonly name: string
  readonly dependency: ComputeDependency
  readonly change: ComputeChange
  readonly length: number
  readonly expected: { start: number; end: number; reset?: boolean }
}

describe('计算依赖与重算区间', () => {
  it.each<RangeCase>([
    {
      name: '有状态从序列起点整段重算',
      dependency: STATEFUL,
      change: { start: 10, end: 12 },
      length: 20,
      expected: { start: 0, end: 20 },
    },
    {
      name: '无界回看整段重算',
      dependency: stateless('unbounded'),
      change: { start: 10, end: 12 },
      length: 20,
      expected: { start: 0, end: 20 },
    },
    {
      name: '有界回看向前后各扩 lookback 根',
      dependency: stateless(3),
      change: { start: 10, end: 12 },
      length: 20,
      expected: { start: 7, end: 15 },
    },
    {
      name: '扩边结果裁剪到序列范围',
      dependency: stateless(3),
      change: { start: 1, end: 19 },
      length: 20,
      expected: { start: 0, end: 20 },
    },
    {
      name: 'reset 忽略变化区间整段重算',
      dependency: stateless(3),
      change: { start: 10, end: 12, reset: true },
      length: 20,
      expected: { start: 0, end: 20, reset: true },
    },
  ])('$name', ({ dependency, change, length, expected }) => {
    expect(resolveComputeRange(change, dependency, length)).toEqual(expected)
  })
})
