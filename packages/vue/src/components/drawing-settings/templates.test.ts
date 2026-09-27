import 'fake-indexeddb/auto'

import { createIndexedDbPersistence } from '@363045841yyt/klinechart-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { loadDrawingTemplates, saveDrawingTemplates } from './templates'

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('@363045841yyt/klinechart-drawing-templates')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database deletion blocked'))
  })
})

describe('drawing templates', () => {
  it('saves templates per drawing kind', async () => {
    expect(
      await saveDrawingTemplates('rectangle', [
        { name: '红框', style: { fill: '#ff0000', stroke: '#000000' } },
      ]),
    ).toBe(true)
    expect(await loadDrawingTemplates('rectangle')).toEqual([
      { name: '红框', style: { fill: '#ff0000', stroke: '#000000' } },
    ])
    expect(await loadDrawingTemplates('trend-line')).toEqual([])
  })

  it('saves a second template alongside Vue reactive templates', async () => {
    const templates = ref([{ name: '第一个', style: { stroke: '#123456' } }])
    expect(await saveDrawingTemplates('trend-line', templates.value)).toBe(true)

    templates.value = [...templates.value, { name: '第二个', style: { stroke: '#abcdef' } }]
    expect(await saveDrawingTemplates('trend-line', templates.value)).toBe(true)
    expect(await loadDrawingTemplates('trend-line')).toEqual([
      { name: '第一个', style: { stroke: '#123456' } },
      { name: '第二个', style: { stroke: '#abcdef' } },
    ])
  })

  it('discards invalid stored templates', async () => {
    expect(
      await saveDrawingTemplates('trend-line', [
        { name: '有效', style: { stroke: '#123456' } },
        { name: '无效', style: { stroke: 'not-a-color' } },
      ]),
    ).toBe(true)
    expect(await loadDrawingTemplates('trend-line')).toEqual([
      { name: '有效', style: { stroke: '#123456' } },
    ])
  })

  it('propagates IndexedDB write and delete errors', async () => {
    const store = createIndexedDbPersistence({
      databaseName: '@363045841yyt/klinechart-drawing-templates',
      storeName: 'templates',
      key: 'trend-line',
      codec: { encode: (value: string) => value, decode: (value) => String(value) },
      flushOnPageHide: false,
    })
    vi.stubGlobal('indexedDB', undefined)
    try {
      await expect(store.save('test')).rejects.toThrow('IndexedDB is unavailable')
      await expect(store.clear()).rejects.toThrow('IndexedDB is unavailable')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
