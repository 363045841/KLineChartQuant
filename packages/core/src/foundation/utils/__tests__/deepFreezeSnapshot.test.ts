/** 深冻结快照：复制共享引用、拒绝环，保证状态写入拿到独立副本。 */
import { expect, it } from 'vitest'
import { deepFreezeSnapshot } from '../deepFreezeSnapshot.js'

it('copies repeated references and rejects actual cycles', () => {
  const shared = { size: 2 }
  const snapshot = deepFreezeSnapshot({ first: shared, second: shared })
  shared.size = 3
  expect(snapshot).toEqual({ first: { size: 2 }, second: { size: 2 } })
  const cycle: unknown[] = []
  cycle.push(cycle)
  expect(() => deepFreezeSnapshot(cycle)).toThrow(/cycles/)
})
