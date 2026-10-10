/** 指标实现按需加载：选择器切换先加载该指标自身的实现，再写入图表。 */

import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createMockChartController } from '../../../__tests__/_mockController'
import { useIndicatorManager } from '../useIndicatorManager'

/** 记录加载与写入的先后顺序。 */
function createFixture() {
  const controller = createMockChartController()
  const events: string[] = []
  vi.spyOn(controller, 'loadIndicators').mockImplementation(async (ids) => {
    events.push(`load:${ids.join(',')}`)
  })
  vi.spyOn(controller, 'addIndicator').mockImplementation((id, role) => {
    events.push(`add:${id}:${role}`)
    return 'instance'
  })
  const manager = useIndicatorManager(
    shallowRef<ChartController | null>(controller),
    shallowRef({}),
  )
  return { controller, events, manager }
}

describe('useIndicatorManager on-demand loading', () => {
  it.each([
    { id: 'RSI', role: 'sub' },
    { id: 'BOLL', role: 'main' },
  ])('loads $id before adding it to the $role pane', async ({ id, role }) => {
    const { events, manager } = createFixture()
    await manager.handleIndicatorToggle(id, true)
    expect(events).toEqual([`load:${id}`, `add:${id}:${role}`])
  })

  it('classifies indicators from the static catalog without loading them', () => {
    const { events, manager } = createFixture()
    expect(manager.isSubPaneIndicator('MACD')).toBe(true)
    expect(manager.isSubPaneIndicator('MA')).toBe(false)
    expect(manager.getDefaultParams('MACD')).toEqual({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    })
    expect(events).toEqual([])
  })
})
