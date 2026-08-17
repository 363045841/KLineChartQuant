/** 数据管理状态的视图快照测试。 */
import { describe, expect, it } from 'vitest'

import { createDataManagerState } from '../dataManagerState'

describe('dataManagerState viewport snapshots', () => {
  it('isolates snapshots by view key and consumes only the requested snapshot', () => {
    const state = createDataManagerState()
    const dailyKey = 'id:600519:daily:none:kline'
    const hourlyKey = 'id:600519:60min:none:kline'

    state.actions.saveViewportSnapshot(dailyKey, {
      anchorTimestamp: 100,
      anchorOffsetPx: 12,
      zoomLevel: 8,
    })
    state.actions.saveViewportSnapshot(hourlyKey, {
      anchorTimestamp: 200,
      anchorOffsetPx: 4,
      zoomLevel: 4,
    })

    expect(state.actions.consumeViewportSnapshot(dailyKey)).toEqual({
      anchorTimestamp: 100,
      anchorOffsetPx: 12,
      zoomLevel: 8,
    })
    expect(state.actions.getViewportSnapshot(hourlyKey)).toEqual({
      anchorTimestamp: 200,
      anchorOffsetPx: 4,
      zoomLevel: 4,
    })
  })
})
