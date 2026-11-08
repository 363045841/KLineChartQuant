/** VM drawing 入口：公共 line API 直接产出公共 DrawingObject，并记录会话增量。 */
let __drawingObjects: DrawingObject[] = []
let __drawingSequence = 0
/** 外部回滚计数；绘图 API 据此重建引用表。 */
let __drawingEpoch = 0
/** 本次运行新增或修改的绘图 id；会话据此生成增量输出。 */
const __drawingDirty = new Set<string>()
/** 本次运行删除的绘图 id。 */
const __drawingRemoved = new Set<string>()

/** 标记对象为脏；replace 整体标记，append 只标记本次新增对象。 */
function __markDrawingDirty(drawings: readonly DrawingObject[]): void {
  for (const drawing of drawings) __drawingDirty.add(drawing.id)
}

const __drawingStore = {
  list: () => __drawingObjects,
  replace: (drawings: readonly DrawingObject[]) => {
    if (__count() === 0) throw new TypeError('drawing 只能在 onBar 中创建或修改')
    const previous = new Map(__drawingObjects.map((drawing) => [drawing.id, drawing]))
    const nextIds = new Set(drawings.map((drawing) => drawing.id))
    for (const id of previous.keys()) if (!nextIds.has(id)) __drawingRemoved.add(id)
    for (const drawing of drawings) {
      // 未变化的条目在 updateMany 中保持原引用；只标记真正被替换的对象。
      if (previous.get(drawing.id) !== drawing) __drawingDirty.add(drawing.id)
    }
    __drawingObjects = [...drawings]
  },
  /** VM 是单次运行的独占容器，追加与回收原地完成，避免按对象数量平方复制。 */
  append: (drawings: readonly DrawingObject[], removeIds: readonly string[]) => {
    if (__count() === 0) throw new TypeError('drawing 只能在 onBar 中创建或修改')
    for (const id of removeIds) __drawingRemoved.add(id)
    if (removeIds.length > 0) {
      const removed = new Set(removeIds)
      let write = 0
      for (const drawing of __drawingObjects) {
        if (removed.has(drawing.id)) continue
        __drawingObjects[write++] = drawing
      }
      __drawingObjects.length = write
    }
    __markDrawingDirty(drawings)
    for (const drawing of drawings) __drawingObjects.push(drawing)
  },
  nextId: () => `drawing-${++__drawingSequence}`,
  epoch: () => __drawingEpoch,
}
const line: DrawingLineApi = createDrawingLineApi(__drawingStore, {
  paneId: '',
  ownerId: 'script',
  defaultColor: Color.Blue,
  get maxLines() {
    return __definition!.max_lines_count
  },
  get barCount() {
    return __count()
  },
})
const box: DrawingBoxApi = createDrawingBoxApi(__drawingStore, {
  paneId: '',
  ownerId: 'script',
  get maxObjects() {
    return __definition!.max_boxes_count
  },
  get barCount() {
    return __count()
  },
})
const label: DrawingLabelApi = createDrawingLabelApi(__drawingStore, {
  paneId: '',
  ownerId: 'script',
  get maxObjects() {
    return __definition!.max_labels_count
  },
  get barCount() {
    return __count()
  },
})
/** Pine 的末根判断，历史计算只在最后一根构建固定回看分布。 */
const barstate = Object.freeze({
  get islast() {
    return __count() > 0 && __count() === __barCount()
  },
})
/** 当前 bar 的标量索引。 */
Object.defineProperty(globalThis, 'bar_index', { get: () => __count() - 1 })
/** chart.point 工厂返回值对象，创建线时复制。 */
const chart = Object.freeze({
  point: Object.freeze({
    new: (time: number, index: number, price: number): ChartPoint => ({ time, index, price }),
    now: (price: number): ChartPoint => ({ time: time[0], index: __count() - 1, price }),
    from_index: (index: number, price: number): ChartPoint => ({ index, price }),
    from_time: (time: number, price: number): ChartPoint => ({ time, price }),
    copy: (point: ChartPoint): ChartPoint => ({ ...point }),
  }),
})
/** 只输出值快照，不泄露 Map 和运行时引用。 */
function __drawingSnapshot(): readonly DrawingObject[] {
  return __drawingObjects
}

/** 绘图检查点：记录当前对象身份与 id 序列，供同 bar 回滚。 */
function __drawingCheckpoint(): DrawingCheckpoint {
  return {
    ids: new Set(__drawingObjects.map((drawing) => drawing.id)),
    sequence: __drawingSequence,
  }
}

/** 回滚到检查点；被撤销的对象进入 remove，重算后同一 id 再 upsert。 */
function __drawingRollback(checkpoint: DrawingCheckpoint): void {
  for (const drawing of __drawingObjects)
    if (!checkpoint.ids.has(drawing.id)) __drawingRemoved.add(drawing.id)
  __drawingObjects = __drawingObjects.filter((drawing) => checkpoint.ids.has(drawing.id))
  __drawingSequence = checkpoint.sequence
  __drawingEpoch++
  __drawingDirty.clear()
}

/** 取走自上次调用以来的绘图增量；reset 表示消费端必须整体替换。 */
function __drawingDelta(reset: boolean): DrawingDelta {
  const upsert = reset
    ? __drawingObjects.slice()
    : __drawingObjects.filter((drawing) => __drawingDirty.has(drawing.id))
  // 回滚后同 id 重算的对象已经进入 upsert，无需再让消费端先删除。
  const remove = reset ? [] : [...__drawingRemoved].filter((id) => !__drawingDirty.has(id))
  __drawingDirty.clear()
  __drawingRemoved.clear()
  return { reset, upsert, remove }
}

/** 会话检查点：series 回滚下标、绘图对象快照与有状态库快照。 */
function __checkpoint(): ScriptCheckpoint {
  return {
    index: __count(),
    drawings: __drawingCheckpoint(),
    libraries: __checkpointLibraries(),
  }
}

/** 回滚到会话检查点；只撤销检查点之后的缓存、绘图与库状态，不重建历史。 */
function __rollback(checkpoint: ScriptCheckpoint): void {
  __rollbackSeries(checkpoint.index)
  __drawingRollback(checkpoint.drawings)
  __rollbackLibraries(checkpoint.libraries)
}

Object.assign(globalThis, { line, box, label, chart, barstate })
