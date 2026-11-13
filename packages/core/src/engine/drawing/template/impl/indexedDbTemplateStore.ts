/**
 * IndexedDB 模板仓库：实现 DrawingTemplateStore 契约，按图元类型分键存整份列表。
 */

import { createDocumentStore, type DocumentStore } from '@/foundation/persistence/index.js'

import type { DrawingKind } from '../../types.js'
import type { DrawingTemplate, DrawingTemplateStore } from '../types.js'
import { templateCodec, toPlainTemplate } from './codec.js'

const DATABASE_NAME = '@363045841yyt/klinechart-drawing-templates'
const STORE_NAME = 'templates'

/** 取某类图元的持久化仓库；同类图元共享同一个连接。 */
function persistence(kind: DrawingKind): DocumentStore<DrawingTemplate[]> {
  return createDocumentStore<DrawingTemplate[]>({
    databaseName: DATABASE_NAME,
    version: 1,
    storeName: STORE_NAME,
    key: kind,
    codec: templateCodec,
  })
}

/** 创建基于 IndexedDB 的模板仓库。 */
export function createDrawingTemplateStore(
  createPersistence: (kind: DrawingKind) => DocumentStore<DrawingTemplate[]> = persistence,
): DrawingTemplateStore {
  const stores = new Map<DrawingKind, DocumentStore<DrawingTemplate[]>>()

  /** 每类图元只创建一个仓库，写操作因此共享同一连接和事务时序。 */
  function store(kind: DrawingKind): DocumentStore<DrawingTemplate[]> {
    let current = stores.get(kind)
    if (!current) {
      current = createPersistence(kind)
      stores.set(kind, current)
    }
    return current
  }

  async function list(kind: DrawingKind): Promise<DrawingTemplate[]> {
    return (await store(kind).read()) ?? []
  }

  return {
    list,

    async upsert(kind, template) {
      const plain = toPlainTemplate(template)
      return await store(kind).update((current) => {
        const templates = current ?? []
        const index = templates.findIndex((item) => item.name === plain.name)
        const next = [...templates]
        if (index < 0) next.push(plain)
        else next[index] = plain
        return next
      })
    },

    async remove(kind, name) {
      return await store(kind).update((current) => {
        const templates = current ?? []
        const next = templates.filter((item) => item.name !== name)
        return next.length === templates.length ? templates : next
      })
    },

    async dispose() {
      await Promise.all([...stores.values()].map((current) => current.dispose()))
      stores.clear()
    },
  }
}
