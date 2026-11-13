import { describe, expect, it } from 'vitest'
import { INDICATOR_ROLE } from '../indicatorRole.js'
import { createIndicatorState } from '../indicatorState.js'

/** 建一个含两个 pane 的实例集合：main 三个、rsi 一个。 */
function createStateWithInstances() {
  const state = createIndicatorState()
  const add = (instanceId: string, paneId: string, role: 'main' | 'sub') =>
    state.actions.addInstance({
      instanceId,
      indicatorId: 'ma',
      paneId,
      role,
      params: {},
    })
  add('main_a', 'main', INDICATOR_ROLE.MAIN)
  add('main_b', 'main', INDICATOR_ROLE.MAIN)
  add('main_c', 'main', INDICATOR_ROLE.MAIN)
  add('rsi_a', 'rsi', INDICATOR_ROLE.SUB)
  return state
}

/** 读取指定 pane 内按 ordinal 排好序的实例身份。 */
function paneOrder(state: ReturnType<typeof createIndicatorState>, paneId: string): string[] {
  return state.readonly.instances
    .peek()
    .filter((instance) => instance.paneId === paneId)
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((instance) => instance.instanceId)
}

describe('indicatorState.applyPaneInstanceOrder', () => {
  it('只重排目标 pane，其他 pane 的相对顺序不变', () => {
    const state = createStateWithInstances()

    expect(state.actions.applyPaneInstanceOrder('main', ['main_c', 'main_a', 'main_b'])).toBe(true)

    expect(paneOrder(state, 'main')).toEqual(['main_c', 'main_a', 'main_b'])
    expect(paneOrder(state, 'rsi')).toEqual(['rsi_a'])
  })

  it('集合与该 pane 现有实例不匹配时整批拒绝', () => {
    const state = createStateWithInstances()
    const before = state.readonly.instances.peek()

    expect(state.actions.applyPaneInstanceOrder('main', ['main_a', 'main_b'])).toBe(false)
    expect(state.readonly.instances.peek()).toBe(before)
  })
})

describe('indicatorState locked', () => {
  it('锁定只写实例配置，不参与计算身份', () => {
    const state = createStateWithInstances()
    const revision = state.readonly.configRevision.peek()

    expect(state.actions.updateInstance('main_a', { locked: true })).toBe(true)
    const locked = state.readonly.instances.peek().find((item) => item.instanceId === 'main_a')
    expect(locked?.locked).toBe(true)
    // 参数与归属未变时，计算 revision 不因锁定而递增。
    expect(state.readonly.configRevision.peek()).toBe(revision)

    expect(state.actions.updateInstance('main_a', { locked: false })).toBe(true)
    const unlocked = state.readonly.instances.peek().find((item) => item.instanceId === 'main_a')
    expect(unlocked?.locked).toBeUndefined()
  })
})
