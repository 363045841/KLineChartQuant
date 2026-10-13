/** 每次脚本运行独立持有行情、游标和派生序列缓存。 */
import type { Bar } from '../../contracts/input.js'
import type { Series } from '../types.js'

interface SeriesState {
  runtime: SeriesRuntime
  read(index: number): number
  derived: Map<string, Series>
}
const states = new WeakMap<Series, SeriesState>()

/** 数字索引由 Proxy 按当前游标解释，不暴露历史数组。 */
class SeriesView implements Series {
  declare readonly 0: number
  declare readonly 1: number
  readonly [offset: number]: number
  /** 动态偏移与下标共用相同的读取规则。 */
  constructor(readonly at: (offset: number) => number) {}
}

/** 创建只读索引视图，拒绝未来引用与修改。 */
function createView(state: SeriesState): Series {
  /** 将过去偏移转换为绝对历史位置。 */
  function at(offset: number): number {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new RangeError('Series offset 必须是非负整数')
    const index = state.runtime.index - offset
    return index < 0 ? Number.NaN : state.read(index)
  }
  const view = new Proxy(new SeriesView(at), {
    get(_target, key) {
      if (typeof key !== 'string') return undefined
      if (key === 'at') return at
      const offset = Number(key)
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new RangeError('Series offset 必须是非负整数')
      }
      return at(offset)
    },
    set() {
      throw new TypeError('Series 是只读的')
    },
    defineProperty() {
      throw new TypeError('Series 是只读的')
    },
    deleteProperty() {
      throw new TypeError('Series 是只读的')
    },
  })
  states.set(view, state)
  return view
}

/** 获取序列所属的运行态，拒绝普通数组替代序列。 */
function getState(source: Series): SeriesState {
  const state = states.get(source)
  if (!state) throw new TypeError('金融函数需要引擎提供的 Series')
  return state
}

/** 金融库读取绝对历史位置；超出当前游标返回 NaN。 */
export function readSeriesAt(source: Series, index: number): number {
  const state = getState(source)
  return index < 0 || index > state.runtime.index ? Number.NaN : state.read(index)
}

/** 根据输入与参数复用派生序列，补齐未调用期间的历史计算。 */
export function deriveSeries(
  source: Series,
  key: string,
  calculate: (index: number, sourceAt: (index: number) => number, previous: number) => number,
): Series {
  const state = getState(source)
  const existing = state.derived.get(key)
  if (existing) return existing
  const values: number[] = []
  // 写入时立即失效，避免修正后未读取就进入下一根时残留旧缓存。
  state.runtime.onWrite((index) => {
    values.length = Math.min(values.length, index)
  })
  const derived = createView({
    runtime: state.runtime,
    derived: new Map(),
    /** 当前 bar 修正只丢弃当前缓存，已完成历史保持不变。 */
    read(index) {
      for (let next = values.length; next <= index; next++) {
        values.push(calculate(next, state.read, values[next - 1] ?? Number.NaN))
      }
      return values[index] ?? Number.NaN
    },
  })
  state.derived.set(key, derived)
  return derived
}

/** 可逐根追加，也可覆盖同一时间戳的最后一根 K 线。 */
export class SeriesRuntime {
  private readonly bars: Bar[] = []
  private readonly invalidators = new Set<(index: number) => void>()
  private currentIndex = -1
  private currentRevision = 0
  /** 当前 K 线的绝对位置。 */
  get index(): number {
    return this.currentIndex
  }
  /** 行情追加或覆盖的版本。 */
  get revision(): number {
    return this.currentRevision
  }
  readonly open = this.field('open')
  readonly high = this.field('high')
  readonly low = this.field('low')
  readonly close = this.field('close')
  readonly volume = this.field('volume')
  readonly time = this.field('time')

  /** 写入行情并推进游标；旧时间戳必须由宿主重新执行历史。 */
  write(bar: Bar): void {
    if (!Number.isFinite(bar.time)) throw new RangeError('行情时间必须是有限数字')
    const last = this.bars[this.index]
    if (last && bar.time < last.time) throw new RangeError('行情必须按时间升序写入')
    if (!last || bar.time > last.time) this.currentIndex++
    this.bars[this.index] = { ...bar }
    this.currentRevision++
    for (const invalidate of this.invalidators) invalidate(this.index)
  }

  /** 注册本次运行的派生缓存失效操作，与运行态一起释放。 */
  onWrite(invalidate: (index: number) => void): void {
    this.invalidators.add(invalidate)
  }

  /** 为行情字段建立共享游标的序列。 */
  private field(field: 'open' | 'high' | 'low' | 'close' | 'volume' | 'time'): Series {
    return createView({
      runtime: this,
      read: (index) => this.bars[index]?.[field] ?? Number.NaN,
      derived: new Map(),
    })
  }
}
