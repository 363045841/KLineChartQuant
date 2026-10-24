/** VM drawing 入口：公共 line API 直接产出公共 DrawingObject。 */
let __drawingObjects: DrawingObject[] = []
let __drawingSequence = 0
const __drawingStore = {
  list: () => __drawingObjects,
  replace: (drawings: readonly DrawingObject[]) => {
    if (__count() === 0) throw new TypeError('drawing 只能在 onBar 中创建或修改')
    __drawingObjects = [...drawings]
  },
  /** VM 是单次运行的独占容器，追加与回收原地完成，避免按对象数量平方复制。 */
  append: (drawings: readonly DrawingObject[], removeIds: readonly string[]) => {
    if (__count() === 0) throw new TypeError('drawing 只能在 onBar 中创建或修改')
    if (removeIds.length > 0) {
      const removed = new Set(removeIds)
      let write = 0
      for (const drawing of __drawingObjects) {
        if (removed.has(drawing.id)) continue
        __drawingObjects[write++] = drawing
      }
      __drawingObjects.length = write
    }
    for (const drawing of drawings) __drawingObjects.push(drawing)
  },
  nextId: () => `drawing-${++__drawingSequence}`,
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
Object.assign(globalThis, { line, box, label, chart, barstate })
