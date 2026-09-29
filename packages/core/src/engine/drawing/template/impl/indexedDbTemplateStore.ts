/**
 * IndexedDB 模板仓库：实现 DrawingTemplateStore 契约，按图元类型分键存整份列表。
 */

import { createIndexedDbPersistence } from '@/foundation/persistence/index.js'

import type { DrawingKind } from '../../types.js'
import type { DrawingTemplate, DrawingTemplateStore } from '../types.js'
import { templateCodec } from './codec.js'

const DATABASE_NAME = '@363045841yyt/klinechart-drawing-templates'
const STORE_NAME = 'templates'
/** 内部失败原因，由上层门面转换成界面文案。 */
const PERSIST_FAILED = 'Drawing templates were not persisted'

type TemplatePersistence = {
  load(): Promise<DrawingTemplate[] | null>
  save(templates: DrawingTemplate[]): Promise<boolean>
}

/** 取某类图元的持久化句柄。 */
function persistence(kind: DrawingKind) {
  return createIndexedDbPersistence({
    databaseName: DATABASE_NAME,
    storeName: STORE_NAME,
    key: kind,
    codec: templateCodec,
    flushOnPageHide: false,
  })
}

/** 创建基于 IndexedDB 的模板仓库。 */
export function createDrawingTemplateStore(
  createPersistence: (kind: DrawingKind) => TemplatePersistence = persistence,
): DrawingTemplateStore {
  async function list(kind: DrawingKind): Promise<DrawingTemplate[]> {
    return (await createPersistence(kind).load()) ?? []
  }

  /** 写入整份列表并返回，写失败抛错交给上层转入错误态。 */
  async function write(
    kind: DrawingKind,
    templates: DrawingTemplate[],
  ): Promise<DrawingTemplate[]> {
    if (!(await createPersistence(kind).save(templates))) throw new Error(PERSIST_FAILED)
    return templates
  }

  return {
    list,
    async upsert(kind, template) {
      const current = await list(kind)
      const index = current.findIndex((item) => item.name === template.name)
      const next = [...current]
      if (index < 0) next.push(template)
      else next[index] = template
      return write(kind, next)
    },
    async remove(kind, name) {
      const current = await list(kind)
      const next = current.filter((item) => item.name !== name)
      return next.length === current.length ? current : write(kind, next)
    },
  }
}
