// 侧栏存储迁移：旧 agent.panel* 键在首次读取时被读入并写回新键。
import { createLocalStoragePersistence } from '@363045841yyt/klinechart-core'
import { describe, expect, it } from 'vitest'
import { createSidePanelSideStorage, createSidePanelWidthStorage } from '../side-panel-storage.js'

/** 用内存实现替身 Storage，避免依赖真实 localStorage。 */
function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('side panel storage migration', () => {
  it('reads the legacy agent panel width once and writes it to the new key', () => {
    const storage = createMemoryStorage()
    createLocalStoragePersistence<number>({
      key: 'agent.panelWidth',
      codec: { decode: (v) => (typeof v === 'number' ? v : null), encode: (v) => v },
      storage,
    }).save(420)

    expect(createSidePanelWidthStorage(storage).load()).toBe(420)
  })

  it('prefers the new key over the legacy one', () => {
    const storage = createMemoryStorage()
    const codec = { decode: (v: unknown) => (v === 'left' || v === 'right' ? v : null), encode: (v: unknown) => v }
    createLocalStoragePersistence({ key: 'agent.panelSide', codec, storage }).save('left')
    createLocalStoragePersistence({ key: 'workbench.sidePanel.side', codec, storage }).save('right')

    expect(createSidePanelSideStorage(storage).load()).toBe('right')
  })

  it('returns undefined when neither key exists', () => {
    expect(createSidePanelWidthStorage(createMemoryStorage()).load()).toBeUndefined()
  })
})
