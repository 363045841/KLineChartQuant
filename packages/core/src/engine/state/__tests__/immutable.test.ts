import { expect, it } from 'vitest'
import { deepFreezeSnapshot } from '@/foundation/utils/deepFreezeSnapshot.js'
import { immutableMap } from '@/foundation/utils/immutableMap.js'

it('publishes map entries without leaking the backing map', () => {
  const backing = new Map([['axis', 'log']])
  const view = immutableMap(backing)
  backing.set('axis', 'linear')
  expect([...view]).toEqual([['axis', 'log']])
  view.forEach((value, key, map) => {
    expect([key, value]).toEqual(['axis', 'log'])
    expect(map).toBe(view)
    expect(() => Map.prototype.set.call(map, key, 'linear')).toThrow(TypeError)
  })
  expect(view.valueOf()).toBe(view)
  expect(view.get('axis')).toBe('log')
})

it('copies repeated references and rejects actual cycles', () => {
  const shared = { size: 2 }
  const snapshot = deepFreezeSnapshot({ first: shared, second: shared })
  shared.size = 3
  expect(snapshot).toEqual({ first: { size: 2 }, second: { size: 2 } })
  const cycle: unknown[] = []
  cycle.push(cycle)
  expect(() => deepFreezeSnapshot(cycle)).toThrow(/cycles/)
})
