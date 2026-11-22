/** 数据管理状态的视图快照测试。 */
import { describe, expect, it } from 'vitest'

import { createDataManagerState } from '../dataManagerState'

describe('dataManagerState viewport snapshots', () => {
  it('isolates snapshots by view key and keeps them readable after restore', () => {
    const state = createDataManagerState()
    const dailyKey = 'id:600519:daily:none:kline'
    const hourlyKey = 'id:600519:60min:none:kline'

    state.actions.saveViewportSnapshot(dailyKey, {
      anchorTimestamp: 100,
      anchorOffsetSlots: 12,
      zoomLevel: 8,
    })
    state.actions.saveViewportSnapshot(hourlyKey, {
      anchorTimestamp: 200,
      anchorOffsetSlots: 4,
      zoomLevel: 4,
    })

    // 恢复是只读操作：同一快照可以被重复恢复，不因一次恢复而丢失。
    expect(state.actions.getViewportSnapshot(dailyKey)).toEqual({
      anchorTimestamp: 100,
      anchorOffsetSlots: 12,
      zoomLevel: 8,
    })
    expect(state.actions.getViewportSnapshot(dailyKey)).not.toBeNull()
    expect(state.actions.getViewportSnapshot(hourlyKey)).toEqual({
      anchorTimestamp: 200,
      anchorOffsetSlots: 4,
      zoomLevel: 4,
    })
  })
})
