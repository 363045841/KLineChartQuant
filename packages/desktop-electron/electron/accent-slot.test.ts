/**
 * 标识色槽位分配的回归：同屏窗口必须拿到不同槽位。
 */
import { describe, expect, it } from 'vitest'

import { nextAccentSlot } from './accent-slot'

describe('nextAccentSlot', () => {
  it('存活窗口依次分配不同槽位，关闭后优先复用释放的槽位', () => {
    const used: number[] = []
    for (let index = 0; index < 4; index += 1) used.push(nextAccentSlot(used))

    expect(used).toEqual([0, 1, 2, 3])
    used.splice(1, 1)
    expect(nextAccentSlot(used)).toBe(1)
    expect(nextAccentSlot([1, 2, 3])).toBe(0)
  })
})
