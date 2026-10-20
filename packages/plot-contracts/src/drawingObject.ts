/** 公共图形构造入口：手绘文档和脚本 API 统一补齐对象与样式。 */
import type { DrawingObject, DrawingObjectStore } from './drawing.js'

/** 对象构造输入；所有默认值只在公共对象服务补齐。 */
export type DrawingObjectInput = Omit<DrawingObject, 'visible' | 'params' | 'style'> & {
  readonly visible?: boolean
  readonly params?: Record<string, unknown>
  readonly style?: DrawingObject['style']
}

/** 复制调用方的锚点和样式，避免图形模型持有可变输入引用。 */
export function createDrawingObject(input: DrawingObjectInput, defaultColor: string): DrawingObject {
  return snapshotDrawingObject({
    ...input,
    visible: input.visible ?? true,
    params: input.params ?? {},
    style: { stroke: defaultColor, strokeWidth: 1, strokeStyle: 'solid', ...input.style },
  })
}

/** 已存在的快照只复制，不重新套创建默认值，保留省略字段的领域含义。 */
function snapshotDrawingObject(input: DrawingObject): DrawingObject {
  const params = Object.fromEntries(
    Object.entries(input.params).map(([key, value]) => [key, cloneDrawingValue(value)]),
  )
  const labels = input.labels === undefined ? undefined : {
    line: Object.fromEntries(Object.entries(input.labels.line).map(([key, label]) => [key, { ...label }])),
    area: Object.fromEntries(Object.entries(input.labels.area).map(([key, label]) => [key, { ...label }])),
  }
  return { ...input, params, labels,
    anchors: input.anchors.map((anchor) => ({ ...anchor })),
    style: { ...input.style } }
}

/** 图形参数属于可序列化文档数据，递归复制而不依赖宿主专有的 structuredClone。 */
function cloneDrawingValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneDrawingValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneDrawingValue(nested)]))
  }
  return value
}

/** 图形操作的唯一入口；选择、历史和实例生命周期由仓库所属的应用层管理。 */
export function createDrawingObjectApi(store: DrawingObjectStore, defaultColor: string) {
  /** 查询当前唯一状态源。 */
  function get(id: string): DrawingObject | undefined {
    return store.list().find((drawing) => drawing.id === id)
  }
  /** 批量新增仍只提交一次，避免创建和回收、选择之间出现中间状态。 */
  function createMany(inputs: readonly DrawingObjectInput[], removeIds: readonly string[] = []): readonly DrawingObject[] {
    if (inputs.length === 0) return []
    const removed = new Set(removeIds)
    const current = store.list().filter((drawing) => !removed.has(drawing.id))
    const ids = new Set(current.map((drawing) => drawing.id))
    const drawings = inputs.map((input) => {
      if (ids.has(input.id)) throw new TypeError(`Duplicate drawing ID: ${input.id}`)
      ids.add(input.id)
      return createDrawingObject(input, defaultColor)
    })
    store.replace([...current, ...drawings])
    return store.list().slice(-drawings.length)
  }
  /** 批量替换共享单对象规则，任一身份不匹配时整批拒绝。 */
  function updateMany(drawings: readonly DrawingObject[]): readonly DrawingObject[] {
    if (drawings.length === 0) return []
    const current = store.list()
    const byId = new Map(current.map((drawing) => [drawing.id, drawing]))
    const updates = new Map<string, DrawingObject>()
    for (const drawing of drawings) {
      const previous = byId.get(drawing.id)
      if (!previous || previous.kind !== drawing.kind || previous.paneId !== drawing.paneId || previous.ownerId !== drawing.ownerId || updates.has(drawing.id)) return []
      updates.set(drawing.id, snapshotDrawingObject(drawing))
    }
    store.replace(current.map((drawing) => updates.get(drawing.id) ?? drawing))
    const committed = new Map(store.list().map((drawing) => [drawing.id, drawing]))
    return drawings.map((drawing) => committed.get(drawing.id)!)
  }
  /** 同一事务删除整组对象；不存在的 ID 不触发提交。 */
  function deleteMany(ids: readonly string[]): boolean {
    const targets = new Set(ids)
    const current = store.list()
    const next = current.filter((drawing) => !targets.has(drawing.id))
    if (next.length === current.length) return false
    store.replace(next)
    return true
  }
  return {
    /** 返回仓库中的唯一快照，不派生第二份对象状态。 */
    get,
    createMany,
    updateMany,
    deleteMany,
    /** 标准化并新增对象；ID 冲突代表调用方的身份管理错误。 */
    create(input: DrawingObjectInput, removeIds: readonly string[] = []): DrawingObject {
      return createMany([input], removeIds)[0]!
    },
    /** 替换同一对象的完整快照，禁止修改对象种类、面板和归属。 */
    update(drawing: DrawingObject): DrawingObject | null {
      return updateMany([drawing])[0] ?? null
    },
    /** 深复制可变模型，并为对象和锚点重新分配身份；由调用方决定单个还是批量提交。 */
    clone(drawing: DrawingObject): DrawingObject {
      const id = store.nextId()
      return snapshotDrawingObject({ ...drawing, id,
        anchors: drawing.anchors.map((anchor, index) => ({ ...anchor, id: `${id}:${index}` })),
      })
    },
    /** 删除只操作仓库；不存在的 ID 不产生变更。 */
    delete(id: string): boolean {
      return deleteMany([id])
    },
    /** 权威快照只复制和校验身份，不重新应用创建默认值。 */
    replaceAll(inputs: readonly DrawingObject[]): void {
      if (new Set(inputs.map((drawing) => drawing.id)).size !== inputs.length) throw new TypeError('Duplicate drawing IDs')
      store.replace(inputs.map(snapshotDrawingObject))
    },
  }
}
