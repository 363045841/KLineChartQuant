/** 不可变 Map 视图：必须是真 Map（宿主按 instanceof 校验 ReadonlyMap prop），且拒绝写入。 */
import { expect, it } from 'vitest'
import { immutableMap } from '../immutableMap.js'

it('publishes a real Map view that rejects writes', () => {
  const backing = new Map([['axis', 'log']])
  const view = immutableMap(backing)
  // Vue 对 ReadonlyMap prop 的运行时校验是 value instanceof Map，视图必须是 Map 实例。
  expect(view).toBeInstanceOf(Map)

  backing.set('axis', 'linear')
  backing.set('extra', '#000')
  expect([...view]).toEqual([['axis', 'log']])
  expect(view.has('extra')).toBe(false)

  const mutable = view as Map<string, string>
  expect(() => mutable.set('axis', 'linear')).toThrow(TypeError)
  expect(() => mutable.delete('axis')).toThrow(TypeError)
  expect(() => mutable.clear()).toThrow(TypeError)
})
