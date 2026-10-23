/** 脚本对象共用的坐标校验、限额和归属操作；对象状态只存于传入仓库。 */
import type { DrawingKind, DrawingObject, DrawingObjectStore, LineRef, LineXLoc, PersistedDrawingAnchor } from './drawing.js'
import { xloc } from './drawing.js'
import { createDrawingObjectApi } from './drawingObject.js'

export const DRAWING_FUTURE_BARS = 500
export const DEFAULT_DRAWING_COUNT = 50
export const MAX_DRAWING_COUNT = 500

/** 在声明边界一次性补齐并校验对象限额。 */
export function drawingCount(value: number = DEFAULT_DRAWING_COUNT): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DRAWING_COUNT)
    throw new RangeError(`drawing count 必须是 1..${MAX_DRAWING_COUNT} 的整数`)
  return value
}

/** 构造索引或时间锚点；NaN 保留对象身份但不绘制。 */
export function drawingAnchor(id: string, x: number, price: number, mode: LineXLoc, barCount: number): PersistedDrawingAnchor {
  checkedDrawingMember(mode, Object.values(xloc), 'xloc')
  if (x === Infinity || x === -Infinity || price === Infinity || price === -Infinity)
    throw new TypeError('drawing 坐标不能是 Infinity')
  if (Number.isFinite(x) && !Number.isSafeInteger(x)) throw new TypeError('drawing X 坐标必须是整数')
  if (mode === xloc.bar_index && Number.isFinite(x) && (x < 0 || x > barCount - 1 + DRAWING_FUTURE_BARS))
    throw new RangeError('drawing 的 bar_index 超出当前已执行的 K 线范围；时间坐标请用 xloc.bar_time')
  return { id, type: 'point', ...(mode === xloc.bar_index ? { logicalIndex: x } : { time: x }), price }
}

/** 读取锚点原始 X，不混用时间与索引。 */
export function drawingAnchorX(anchor: PersistedDrawingAnchor): number {
  if (anchor.logicalIndex !== undefined) return anchor.logicalIndex
  return typeof anchor.time === 'number' ? anchor.time : Number.NaN
}

/** 在 API 边界拒绝未知枚举成员。 */
export function checkedDrawingMember<T extends string>(value: T, members: readonly T[], name: string): T {
  if (!members.includes(value)) throw new TypeError(`无效的 drawing ${name}`)
  return value
}

/** 线宽使用整数逻辑像素；矩形允许 0 表示无边框。 */
export function drawingWidth(value: number, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`drawing width 必须是 >= ${minimum} 的整数`)
  return value
}

/** 为同归属、同种类对象提供引用和原子写入；不缓存对象快照。 */
export function createOwnedDrawingApi(store: DrawingObjectStore, kind: DrawingKind, ownerId: string | undefined, limit: () => number) {
  const objects = createDrawingObjectApi(store)
  const refs = new Map<string, LineRef>()
  /** 同一存活对象始终返回同一引用。 */
  function reference(id: string): LineRef {
    let ref = refs.get(id)
    if (!ref) { ref = Object.freeze({ id }); refs.set(id, ref) }
    return ref
  }
  /** 只读取属于当前 API 的对象。 */
  function get(ref: LineRef): DrawingObject | undefined {
    const value = objects.get(ref.id)
    return value?.kind === kind && value.ownerId === ownerId ? value : undefined
  }
  /** 按创建顺序枚举当前对象。 */
  function list(): readonly DrawingObject[] {
    return store.list().filter((value) => value.kind === kind && value.ownerId === ownerId)
  }
  /** 创建与回收最早对象在同一仓库提交中完成。 */
  function insert(value: DrawingObject): LineRef {
    const current = list()
    const evicted = current.slice(0, Math.max(0, current.length + 1 - limit()))
    objects.create(value, evicted.map((item) => item.id))
    for (const item of evicted) refs.delete(item.id)
    return reference(value.id)
  }
  /** 已删除引用不会重新创建对象。 */
  function update(ref: LineRef, patch: Partial<DrawingObject>): void {
    const value = get(ref)
    if (value) objects.update({ ...value, ...patch })
  }
  return {
    get, insert, update,
    all: () => Object.freeze(list().map((value) => reference(value.id))),
    /** 样式修改复用完整快照提交。 */
    style(ref: LineRef, patch: Partial<DrawingObject['style']>): void {
      const value = get(ref)
      if (value) update(ref, { style: { ...value.style, ...patch } })
    },
    /** 复制模型并分配独立对象及锚点身份。 */
    copy(ref: LineRef): LineRef | null {
      const value = get(ref)
      return value ? insert(objects.clone(value)) : null
    },
    /** 删除空引用或失效引用无操作。 */
    delete(ref: LineRef | null): void {
      if (ref && get(ref)) { objects.delete(ref.id); refs.delete(ref.id) }
    },
  }
}
