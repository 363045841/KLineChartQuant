/**
 * IndexedDB 模板仓库用例：CRUD、脏数据过滤、写失败传播与释放。
 */

import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDrawingTemplateStore } from '../impl/indexedDbTemplateStore.js'

const DATABASE_NAME = '@363045841yyt/klinechart-drawing-templates'

let store: ReturnType<typeof createDrawingTemplateStore>

/** 删除测试数据库，确保用例之间没有持久化状态。 */
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database deletion blocked'))
  })
}

beforeEach(async () => {
  await deleteDatabase()
  store = createDrawingTemplateStore()
})

afterEach(async () => {
  await store.dispose()
})

describe('createDrawingTemplateStore', () => {
  it('按图元类型完成新增、同名替换与删除，且不影响其他类型', async () => {
    const rectangle = { name: '红框', style: { fill: '#ff0000', stroke: '#000000' } }
    const dashed = {
      name: '虚线',
      style: { stroke: '#abcdef', strokeWidth: 3, strokeStyle: 'dashed' as const },
      labelPosition: 'end' as const,
    }
    await store.upsert('rectangle', rectangle)
    expect(await store.upsert('rectangle', dashed)).toEqual([rectangle, dashed])
    expect(await store.list('trend-line')).toEqual([])

    const original = { name: '样式', style: { stroke: '#123456' } }
    const other = { name: '其它', style: { stroke: '#abcdef' } }
    await store.upsert('trend-line', original)
    await store.upsert('trend-line', other)
    const replacement = {
      name: '样式',
      style: { stroke: '#fedcba', strokeWidth: 2 },
      labelPosition: 'start' as const,
    }
    expect(await store.upsert('trend-line', replacement)).toEqual([replacement, other])
    expect(await store.remove('trend-line', '不存在')).toEqual([replacement, other])
    expect(await store.remove('trend-line', '其它')).toEqual([replacement])
    expect(await store.list('trend-line')).toEqual([replacement])
  })

  it('读取时丢弃非法持久化数据', async () => {
    await store.upsert('trend-line', { name: '有效', style: { stroke: '#123456' } })
    // 绕过写校验直接放入脏数据，验证读取过滤。
    await store.upsert('trend-line', { name: '无效', style: { stroke: 'not-a-color' } })
    expect((await store.list('trend-line')).map((item) => item.name)).toEqual(['有效'])
  })

  it('IndexedDB 不可用时写操作抛出类型化错误', async () => {
    vi.stubGlobal('indexedDB', undefined)
    try {
      await expect(store.upsert('trend-line', { name: 'x', style: {} })).rejects.toMatchObject({
        code: 'PERSISTENCE_UNAVAILABLE',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
