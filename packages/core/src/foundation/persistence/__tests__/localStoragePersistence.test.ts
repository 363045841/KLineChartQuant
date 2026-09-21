/** LocalStorage 持久化原语测试：编解码边界、延迟写入与生命周期。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLocalStoragePersistence, type PersistenceCodec } from '../localStoragePersistence.js'
import { createMemoryKeyValueStorage } from './_memoryKeyValueStorage.js'

interface Payload {
  readonly value: number
}

const payloadCodec: PersistenceCodec<Payload> = {
  decode(value): Payload | null {
    if (!value || typeof value !== 'object') return null
    const candidate = Object.getOwnPropertyDescriptor(value, 'value')?.value
    return typeof candidate === 'number' ? { value: candidate } : null
  },
  encode(payload): unknown {
    return payload
  },
}

describe('createLocalStoragePersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads and decodes a persisted payload', () => {
    const storage = createMemoryKeyValueStorage(JSON.stringify({ value: 7 }))
    const persistence = createLocalStoragePersistence({
      key: 'test.key',
      codec: payloadCodec,
      storage,
    })

    expect(persistence.load()).toEqual({ value: 7 })
  })

  it('returns null for missing, corrupt or codec-rejected values', () => {
    const storage = createMemoryKeyValueStorage()
    const persistence = createLocalStoragePersistence({
      key: 'test.key',
      codec: payloadCodec,
      storage,
    })

    expect(persistence.load()).toBeNull()

    storage.getItem.mockReturnValueOnce('{')
    expect(persistence.load()).toBeNull()

    storage.getItem.mockReturnValueOnce(JSON.stringify({ value: 'nope' }))
    expect(persistence.load()).toBeNull()
  })

  it('saves immediately with the encoded representation', () => {
    const storage = createMemoryKeyValueStorage()
    const persistence = createLocalStoragePersistence({
      key: 'test.key',
      codec: payloadCodec,
      storage,
    })

    expect(persistence.save({ value: 1 })).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith('test.key', JSON.stringify({ value: 1 }))
    expect(persistence.load()).toEqual({ value: 1 })
  })

  it('coalesces scheduled writes and evaluates the value at flush time', () => {
    const storage = createMemoryKeyValueStorage()
    const persistence = createLocalStoragePersistence({
      key: 'test.key',
      codec: payloadCodec,
      storage,
    })
    let current: Payload = { value: 1 }

    persistence.schedule(() => current)
    persistence.schedule(() => current)
    vi.advanceTimersByTime(999)
    expect(storage.setItem).not.toHaveBeenCalled()

    current = { value: 2 }
    vi.advanceTimersByTime(1)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenLastCalledWith('test.key', JSON.stringify({ value: 2 }))
  })

  it('flushes pending work on demand and on dispose', () => {
    const storage = createMemoryKeyValueStorage()
    const persistence = createLocalStoragePersistence({
      key: 'test.key',
      codec: payloadCodec,
      storage,
    })

    persistence.schedule(() => ({ value: 3 }))
    expect(persistence.flush()).toBe(true)
    expect(storage.setItem).toHaveBeenCalledTimes(1)

    persistence.schedule(() => ({ value: 4 }))
    persistence.dispose()
    expect(storage.setItem).toHaveBeenLastCalledWith('test.key', JSON.stringify({ value: 4 }))
  })

  it('clears the stored value and cancels pending writes', () => {
    const storage = createMemoryKeyValueStorage(JSON.stringify({ value: 5 }))
    const persistence = createLocalStoragePersistence({
      key: 'test.key',
      codec: payloadCodec,
      storage,
    })

    persistence.schedule(() => ({ value: 6 }))
    expect(persistence.clear()).toBe(true)
    vi.advanceTimersByTime(1_000)

    expect(storage.removeItem).toHaveBeenCalledWith('test.key')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(persistence.load()).toBeNull()
  })

  it('degrades silently when no storage backend is available', () => {
    const persistence = createLocalStoragePersistence({
      key: 'test.key',
      codec: payloadCodec,
      storage: null,
    })

    expect(persistence.load()).toBeNull()
    expect(persistence.save({ value: 1 })).toBe(false)
    expect(() => persistence.schedule(() => ({ value: 1 }))).not.toThrow()
  })
})
