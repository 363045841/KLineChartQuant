/** 视图工作区 localStorage 持久化回归测试。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ViewWorkspacesSnapshot } from '../../engine/state/viewWorkspace'
import {
  createViewWorkspacePersistence,
  loadStoredViewWorkspaces,
  VIEW_WORKSPACES_STORAGE_KEY,
} from '../viewWorkspacePersistence'

function createSnapshot(): ViewWorkspacesSnapshot {
  return {
    kline: {
      instances: [
        {
          instanceId: 'main:BOLL',
          indicatorId: 'BOLL',
          paneId: 'main',
          role: 'main',
          ordinal: 0,
          params: { period: 20 },
        },
      ],
      paneRatios: { main: 0.75, RSI_0: 0.25 },
      paneSpecs: [
        { id: 'main', ratio: 0.75, role: 'price' },
        { id: 'RSI_0', ratio: 0.25, role: 'indicator' },
      ],
      paneScaleTypes: { main: 'linear', RSI_0: 'log' },
    },
    timeshare: {
      instances: [],
      paneRatios: { main: 1 },
      paneSpecs: [{ id: 'main', ratio: 1, role: 'price' }],
      paneScaleTypes: { main: 'percent' },
    },
  }
}

function createStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next
    }),
  }
}

describe('view workspace persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads a workspace snapshot', () => {
    const snapshot = createSnapshot()
    const storage = createStorage(JSON.stringify(snapshot))

    expect(loadStoredViewWorkspaces(storage)).toEqual(snapshot)

    storage.getItem.mockReturnValueOnce('{')
    expect(loadStoredViewWorkspaces(storage)).toBeNull()
  })

  it('coalesces writes for one second and flushes pending work on dispose', () => {
    const storage = createStorage()
    let snapshot = createSnapshot()
    const persistence = createViewWorkspacePersistence(() => snapshot, storage)

    persistence.schedule()
    persistence.schedule()
    vi.advanceTimersByTime(999)
    expect(storage.setItem).not.toHaveBeenCalled()

    snapshot = {
      ...snapshot,
      kline: { ...snapshot.kline, paneRatios: { main: 0.6, RSI_0: 0.4 } },
    }
    vi.advanceTimersByTime(1)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenLastCalledWith(
      VIEW_WORKSPACES_STORAGE_KEY,
      JSON.stringify(snapshot),
    )

    persistence.schedule()
    persistence.dispose()
    expect(storage.setItem).toHaveBeenCalledTimes(2)
  })
})
