/**
 * IndexedDB 模板仓库用例：CRUD、脏数据过滤与写失败传播。
 */

import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDrawingTemplateStore } from '../impl/indexedDbTemplateStore.js'

const store = createDrawingTemplateStore()

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('@363045841yyt/klinechart-drawing-templates')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database deletion blocked'))
  })
})

describe('createDrawingTemplateStore', () => {
  it('按图元类型保存并在写入后返回完整列表', async () => {
    const rectangle = { name: '红框', style: { fill: '#ff0000', stroke: '#000000' } }
    expect(await store.upsert('rectangle', rectangle)).toEqual([rectangle])
    expect(await store.list('rectangle')).toEqual([rectangle])
    expect(await store.list('trend-line')).toEqual([])

    const dashed = {
      name: '虚线',
      style: { stroke: '#abcdef', strokeWidth: 3, strokeStyle: 'dashed' as const },
      labelPosition: 'end' as const,
    }
    expect(await store.upsert('rectangle', dashed)).toEqual([rectangle, dashed])
  })

  it('同名保存更新模板', async () => {
    const original = { name: '样式', style: { stroke: '#123456' } }
    await store.upsert('trend-line', original)
    const other = { name: '其它', style: { stroke: '#abcdef' } }
    await store.upsert('trend-line', other)
    const replacement = {
      name: '样式',
      style: { stroke: '#fedcba', strokeWidth: 2 },
      labelPosition: 'start' as const,
    }
    expect(await store.upsert('trend-line', replacement)).toEqual([replacement, other])
    expect(await store.list('trend-line')).toEqual([replacement, other])
  })

  it('按名称删除，缺席的模板不写盘', async () => {
    const first = { name: '一', style: { stroke: '#123456' } }
    const second = { name: '二', style: { stroke: '#abcdef' } }
    await store.upsert('trend-line', first)
    await store.upsert('trend-line', second)

    expect(await store.remove('trend-line', '一')).toEqual([second])
    expect(await store.remove('trend-line', '不存在')).toEqual([second])
    expect(await store.list('trend-line')).toEqual([second])
  })

  it('读取时丢弃非法持久化数据', async () => {
    await store.upsert('trend-line', { name: '有效', style: { stroke: '#123456' } })
    // 绕过写校验直接放入脏数据，验证读取过滤。
    await store.upsert('trend-line', { name: '无效', style: { stroke: 'not-a-color' } })
    expect((await store.list('trend-line')).map((item) => item.name)).toEqual(['有效'])
  })

  it('IndexedDB 不可用时写操作抛错', async () => {
    vi.stubGlobal('indexedDB', undefined)
    try {
      await expect(store.upsert('trend-line', { name: 'x', style: {} })).rejects.toThrow(
        'IndexedDB is unavailable',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
