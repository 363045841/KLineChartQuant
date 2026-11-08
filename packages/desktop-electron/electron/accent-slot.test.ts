/**
 * 标识色槽位分配的回归：同屏窗口必须拿到不同槽位。
 */
import { describe, expect, it } from 'vitest'

import { nextAccentSlot } from './accent-slot'

describe('nextAccentSlot', () => {
  it('从 0 开始依次分配', () => {
    const used: number[] = []
    for (let index = 0; index < 4; index += 1) used.push(nextAccentSlot(used))

    expect(used).toEqual([0, 1, 2, 3])
  })

  it.each([
    ['中间空出', [0, 2], 1],
    ['开头空出', [1, 2], 0],
    ['已连着占满前几个', [0, 1], 2],
  ] as const)('%s时取最小空闲槽位', (_label, taken, expected) => {
    expect(nextAccentSlot(taken)).toBe(expected)
  })
})
