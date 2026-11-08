/** 锁角纯函数：8 个方向、距离不变与阈值以下保持自由落点。 */
import { describe, expect, it } from 'vitest'

import { lockAngle } from '../impl/angleLock'
import { ANGLE_LOCK_MIN_DELTA } from '../types'

/** 固定参考点；用例只关心相对位移。 */
const ORIGIN = { x: 100, y: 100 }

/**
 * 八个档位各给一个偏离目标 22.5° 以内的输入向量，
 * 期望方向用弧度表示（y 轴向下，正角对应价格下行）。
 */
const DIRECTIONS = [
  { name: '0° 水平向右', dx: 20, dy: 6, expected: 0 },
  { name: '45° 右下', dx: 20, dy: 12, expected: Math.PI / 4 },
  { name: '90° 垂直向下', dx: 6, dy: 20, expected: Math.PI / 2 },
  { name: '135° 左下', dx: -12, dy: 20, expected: (Math.PI * 3) / 4 },
  { name: '180° 水平向左', dx: -20, dy: 6, expected: Math.PI },
  { name: '225° 左上', dx: -20, dy: -12, expected: (-Math.PI * 3) / 4 },
  { name: '270° 垂直向上', dx: -6, dy: -20, expected: -Math.PI / 2 },
  { name: '315° 右上', dx: 12, dy: -20, expected: -Math.PI / 4 },
] as const

describe('lockAngle', () => {
  it.each(DIRECTIONS)('把 $name 附近的落点锁定到该方向，距离不变', ({ dx, dy, expected }) => {
    const locked = lockAngle(ORIGIN, { x: ORIGIN.x + dx, y: ORIGIN.y + dy })

    expect(Math.atan2(locked.y - ORIGIN.y, locked.x - ORIGIN.x)).toBeCloseTo(expected, 10)
    expect(Math.hypot(locked.x - ORIGIN.x, locked.y - ORIGIN.y)).toBeCloseTo(Math.hypot(dx, dy), 10)
  })

  it('阈值两侧：小于阈值原样返回，达到阈值开始锁定', () => {
    // 距离 2.2：方向噪声大于意义，保持原落点。
    const tooClose = { x: ORIGIN.x + 2, y: ORIGIN.y + 1 }
    expect(Math.hypot(2, 1)).toBeLessThan(ANGLE_LOCK_MIN_DELTA)
    expect(lockAngle(ORIGIN, tooClose)).toEqual(tooClose)

    // 距离 5、方向 19.9°：进入锁定，按 0° 落定。
    const locked = lockAngle(ORIGIN, { x: ORIGIN.x + 4.7, y: ORIGIN.y + 1.7 })
    expect(locked.y).toBeCloseTo(ORIGIN.y, 10)
    expect(locked.x).toBeCloseTo(ORIGIN.x + Math.hypot(4.7, 1.7), 10)
  })
})
