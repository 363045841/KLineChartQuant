/** VM drawing 入口：公共 line API 直接产出公共 DrawingObject。 */
let __drawingObjects: readonly DrawingObject[] = []
let __drawingSequence = 0
const line: DrawingLineApi = createDrawingLineApi({
  list: () => __drawingObjects,
  replace: (drawings) => {
    if (__count() === 0) throw new TypeError('line 只能在 onBar 中创建或修改')
    __drawingObjects = drawings
  },
  nextId: () => `line-${++__drawingSequence}`,
}, {
  paneId: '', ownerId: 'script', defaultColor: Color.Blue,
  get maxLines() { return __definition?.max_lines_count ?? 50 },
  get barCount() { return __count() },
})
/** 当前 bar 的标量索引。 */
Object.defineProperty(globalThis, 'bar_index', { get: () => __count() - 1 })
/** chart.point 工厂返回值对象，创建线时复制。 */
const chart = Object.freeze({ point: Object.freeze({
  new: (time: number, index: number, price: number): ChartPoint => ({ time, index, price }),
  now: (price: number): ChartPoint => ({ time: time[0], index: __count() - 1, price }),
  from_index: (index: number, price: number): ChartPoint => ({ index, price }),
  from_time: (time: number, price: number): ChartPoint => ({ time, price }),
  copy: (point: ChartPoint): ChartPoint => ({ ...point }),
}) })
/** 只输出值快照，不泄露 Map 和运行时引用。 */
function __drawingSnapshot(): readonly DrawingObject[] { return __drawingObjects }
Object.assign(globalThis, { line, chart })
