/** 可见区间极值索引：按固定块预聚合 Plot 值列，滚动时只扫两个边界块。 */
import {
  isOhlcPlot,
  type OhlcPlotPoint,
  type Plot,
  type PlotPoint,
} from '@363045841yyt/klinechart-plot-contracts'

/** 每块聚合的 bar 数；万根可见窗口下把比较次数从 O(可见根数) 降到 O(块数 + 2 块)。 */
const BLOCK_BARS = 128

/** 把 Plot 的两种数据布局收敛成同一次上下界读取，构建与查询共用同一套规则。 */
interface BoundsSource {
  readonly count: number
  /**
   * 读出该 bar 参与值域的两个端点。
   *
   * @param index bar 下标
   * @param out   写入 [下界, 上界]；只在该 bar 参与时写入
   * @returns 该 bar 是否参与值域
   */
  read(index: number, out: [number, number]): boolean
}

/** 一根 Plot 的块聚合结果。 */
interface PlotBlocks {
  /** 构建时的数据长度；不一致说明同一个 Plot 对象被原地追加，需要重建。 */
  readonly length: number
  readonly source: BoundsSource
  /** 每块 3 个数：下界、上界、是否有值。 */
  readonly summaries: Float64Array
}

/** 按 Plot 对象缓存：每次重新收集都会生成新的 Plot，滚动期间对象不变。 */
const cache = new WeakMap<Plot, PlotBlocks>()

/** 普通值列：非有限值不参与值域，与逐根扫描一致。 */
function valueSource(data: readonly (PlotPoint | undefined)[]): BoundsSource {
  return {
    count: data.length,
    read(index, out) {
      const value = data[index]?.value
      if (value === undefined || !Number.isFinite(value)) return false
      out[0] = value
      out[1] = value
      return true
    },
  }
}

/** OHLC 列：只要存在点就参与，low/high 非有限时按原语义传播 NaN。 */
function ohlcSource(data: readonly (OhlcPlotPoint | undefined)[]): BoundsSource {
  return {
    count: data.length,
    read(index, out) {
      const point = data[index]
      if (!point) return false
      out[0] = point.low
      out[1] = point.high
      return true
    },
  }
}

/** 按 Plot 的 kind 选择值列读取方式。 */
function sourceOf(plot: Plot): BoundsSource {
  return isOhlcPlot(plot) ? ohlcSource(plot.data) : valueSource(plot.data)
}

/** 逐点累加边界；首次直接取端点，之后按 Math.min/Math.max 合并，NaN 会原样传播。 */
function merge(state: { min: number; max: number; has: boolean }, min: number, max: number): void {
  if (!state.has) {
    state.min = min
    state.max = max
    state.has = true
    return
  }
  state.min = Math.min(state.min, min)
  state.max = Math.max(state.max, max)
}

/** 块聚合：一次 O(N) 扫描，之后滚动只查块表。 */
function build(source: BoundsSource): PlotBlocks {
  const blocks = Math.ceil(source.count / BLOCK_BARS)
  const summaries = new Float64Array(blocks * 3)
  const out: [number, number] = [0, 0]
  const state = { min: Infinity, max: -Infinity, has: false }
  for (let block = 0; block < blocks; block += 1) {
    state.min = Infinity
    state.max = -Infinity
    state.has = false
    const end = Math.min(source.count, (block + 1) * BLOCK_BARS)
    for (let index = block * BLOCK_BARS; index < end; index += 1) {
      if (source.read(index, out)) merge(state, out[0], out[1])
    }
    summaries[block * 3] = state.min
    summaries[block * 3 + 1] = state.max
    summaries[block * 3 + 2] = state.has ? 1 : 0
  }
  return { length: source.count, source, summaries }
}

/** 取（或构建）该 Plot 的块索引；Plot 对象是缓存键，滚动期间复用。 */
function blocksOf(plot: Plot): PlotBlocks {
  const cached = cache.get(plot)
  if (cached && cached.length === plot.data.length) return cached
  const created = build(sourceOf(plot))
  cache.set(plot, created)
  return created
}

/**
 * 查询 Plot 在 [start, end) 内的价格上下界。
 *
 * 整块直接读预聚合值，首尾两个不完整的块逐根扫描；结果与逐根扫描完全一致
 * （NaN、空值、OHLC 的 low/high 规则相同）。
 *
 * @param plot  被查询的 Plot
 * @param start 起始 bar 下标（已含 offset 换算）
 * @param end   结束 bar 下标（开区间）
 * @returns 上下界；范围内没有参与值域的点时返回 undefined
 */
export function queryPlotBounds(
  plot: Plot,
  start: number,
  end: number,
): { min: number; max: number } | undefined {
  const first = Math.max(0, start)
  const last = Math.min(plot.data.length, end)
  if (last <= first) return undefined
  const { source, summaries } = blocksOf(plot)
  const out: [number, number] = [0, 0]
  const state = { min: Infinity, max: -Infinity, has: false }
  let cursor = first
  while (cursor < last) {
    const block = Math.floor(cursor / BLOCK_BARS)
    const blockStart = block * BLOCK_BARS
    const blockEnd = Math.min(blockStart + BLOCK_BARS, source.count)
    // 整块覆盖时直接用预聚合值；空块只推进游标。
    if (cursor === blockStart && blockEnd <= last) {
      if (summaries[block * 3 + 2] === 1)
        merge(state, summaries[block * 3]!, summaries[block * 3 + 1]!)
      cursor = blockEnd
      continue
    }
    const stop = Math.min(last, blockEnd)
    for (let index = cursor; index < stop; index += 1) {
      if (source.read(index, out)) merge(state, out[0], out[1])
    }
    cursor = stop
  }
  return state.has ? { min: state.min, max: state.max } : undefined
}
