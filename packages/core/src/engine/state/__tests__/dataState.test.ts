import { describe, it, expect } from 'vitest'
import { createDataState } from '../dataState'

describe('dataState', () => {
  it('applyActiveBufferSnapshot publishes key/data/loading atomically', () => {
    const m = createDataState()
    m.actions.setData([{ t: 1 }])
    m.actions.setLoading(true)
    m.actions.setActiveBufferKey('old')

    const snaps: Array<{ key: string | null; len: number; loading: boolean }> = []
    const push = () => {
      snaps.push({
        key: m.readonly.activeBufferKey.peek(),
        len: m.readonly.data.peek().length,
        loading: m.readonly.loading.peek(),
      })
    }
    m.readonly.activeBufferKey.subscribe(push)
    m.readonly.data.subscribe(push)
    m.readonly.loading.subscribe(push)

    m.actions.applyActiveBufferSnapshot({
      key: 'main:A:daily',
      data: [{ t: 2 }, { t: 3 }],
      loading: false,
    })

    expect(m.readonly.activeBufferKey()).toBe('main:A:daily')
    expect(m.readonly.data()).toHaveLength(2)
    expect(m.readonly.loading()).toBe(false)
    for (const s of snaps) {
      expect(s).toEqual({ key: 'main:A:daily', len: 2, loading: false })
    }
  })

  it('reset clears activeBufferKey with other fields', () => {
    const m = createDataState()
    m.actions.applyActiveBufferSnapshot({
      key: 'main:A:daily',
      data: [{ t: 1 }],
      loading: true,
    })
    m.actions.reset()
    expect(m.readonly.activeBufferKey()).toBeNull()
    expect(m.readonly.data()).toEqual([])
    expect(m.readonly.loading()).toBe(false)
  })
})
