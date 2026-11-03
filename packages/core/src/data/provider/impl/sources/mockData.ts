/**
 * MOCK 日线生成器：按 UTC 日索引即时计算，不预生成数组。
 *
 * 每 MOCK_ANCHOR_SPAN 天一个锚点，锚点价由闭式低频函数给出，段内价格是该锚点到下一
 * 锚点之间的布朗桥。布朗桥两端固定，因此相邻区段必然首尾相连；每根 K 线只依赖自己的
 * 日索引，无论先取哪一页、取多少次、在哪个宿主里取，结果都一样。
 */
import type { KLineData } from '@/controllers/types.js'

export const MOCK_DAY_MS = 86_400_000
/** 锚点间距：段内布朗桥的步数，也是价格连续性的校验点间隔。 */
export const MOCK_ANCHOR_SPAN = 256

const MOCK_BASE_PRICE = 12.5
/** 段内布朗桥的相对波动，约 1.2%/日。 */
const MOCK_BRIDGE_SIGMA = 0.012
/** 影线相对实体端点的最大外扩比例。 */
const MOCK_WICK_SIGMA = 0.008

/** 日 K 桶使用 UTC 零点，与实时更新的时间戳保持一致。 */
export function mockDayStart(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** 时间戳所属的 UTC 日索引；向前取整，负时间戳同样成立。 */
export function mockDayIndex(timestamp: number): number {
  return Math.floor(timestamp / MOCK_DAY_MS)
}

/** 日索引对应的 UTC 零点时间戳。 */
export function mockBarTimestamp(dayIndex: number): number {
  return dayIndex * MOCK_DAY_MS
}

/** 品种种子：同一 symbol 在不同宿主得到同一条序列。 */
export function mockSeedFor(symbol: string): number {
  let seed = 0x811c9dc5
  for (let index = 0; index < symbol.length; index++) seed = mix32(seed ^ symbol.charCodeAt(index))
  return seed
}

/**
 * 锚点价：两个不同周期的正弦叠加，落在基准价 ±47% 的有界区间内。
 * 闭式意味着负锚点索引（无限往前）也能直接取值，不需要从某个起点累加。
 */
export function mockAnchorPrice(seed: number, anchor: number): number {
  const phase = (seed % 997) / 997
  const wave =
    Math.sin(anchor * 0.09 + phase * Math.PI * 2) * 0.35 +
    Math.sin(anchor * 0.31 + phase * Math.PI) * 0.12
  return MOCK_BASE_PRICE * (1 + wave)
}

/**
 * 生成截止 endDayIndex（含）的连续日线，共 count 根。
 *
 * @param seed 品种种子，决定波动细节
 * @param endDayIndex 最后一根的日索引
 * @param count 根数；非正数返回空数组
 * @returns 按时间升序、首尾相接的 K 线
 */
export function generateMockBars(seed: number, endDayIndex: number, count: number): KLineData[] {
  if (count <= 0) return []
  const startDay = endDayIndex - count + 1
  const bars: KLineData[] = []
  let anchor = Number.NaN
  let prices: Float64Array = new Float64Array(0)
  for (let day = startDay; day <= endDayIndex; day++) {
    const current = Math.floor(day / MOCK_ANCHOR_SPAN)
    if (current !== anchor) {
      anchor = current
      prices = segmentPrices(seed, anchor)
    }
    const step = day - anchor * MOCK_ANCHOR_SPAN
    bars.push(createBar(seed, day, prices[step]!, prices[step + 1]!))
  }
  return bars
}

/**
 * 计算一段内的全部价格点：p0 与 pN 是相邻两个锚点价，中间是布朗桥。
 *
 * @param seed 品种种子
 * @param anchor 段索引（可为负）
 * @returns 长度 MOCK_ANCHOR_SPAN + 1 的价格序列，首尾恰为锚点价
 */
function segmentPrices(seed: number, anchor: number): Float64Array {
  const steps = MOCK_ANCHOR_SPAN
  const start = mockAnchorPrice(seed, anchor)
  const end = mockAnchorPrice(seed, anchor + 1)
  const gaussian = createGaussian(createRandom(seedOf(seed, anchor)))
  const walk = new Float64Array(steps + 1)
  for (let index = 1; index <= steps; index++) walk[index] = walk[index - 1]! + gaussian()
  const drift = end - start
  const sigma = start * MOCK_BRIDGE_SIGMA
  const prices = new Float64Array(steps + 1)
  prices[0] = start
  for (let index = 1; index < steps; index++) {
    // 布朗桥：扣掉线性漂移项，使第 steps 步严格回到锚点价。
    const bridge = walk[index]! - (walk[steps]! * index) / steps
    prices[index] = start + (drift * index) / steps + sigma * bridge
  }
  prices[steps] = end
  return prices
}

/** 组装单根 K 线；open/close 取相邻价格点，因此上一根 close 恒等于下一根 open。 */
function createBar(seed: number, day: number, openPrice: number, closePrice: number): KLineData {
  const open = roundPrice(openPrice)
  const close = roundPrice(closePrice)
  const random = createRandom(seedOf(seed, day, 0x51ed))
  const high = roundPrice(Math.max(open, close) * (1 + random() * MOCK_WICK_SIGMA))
  const low = roundPrice(Math.min(open, close) * (1 - random() * MOCK_WICK_SIGMA))
  const volume = Math.round(1_000_000 + random() * 10_000_000)
  return {
    timestamp: mockBarTimestamp(day),
    open,
    close,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    volume,
    turnover: Math.round((volume * (open + close)) / 2),
  }
}

/** 价格固定两位小数；同一个输入永远得到同一个价格，段间比较不会因精度漂移。 */
function roundPrice(value: number): number {
  return Math.round(value * 100) / 100
}

/** splitmix32 混合：把任意整数打散成 32 位状态。 */
function mix32(value: number): number {
  let x = value >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0
  return (x ^ (x >>> 15)) >>> 0
}

/** 由若干整数组合出种子，保证相同输入永远得到相同序列。 */
function seedOf(...values: readonly number[]): number {
  let seed = 0x9e3779b9
  for (const value of values) seed = mix32(seed ^ (value | 0))
  return seed
}

/** splitmix32 序列：返回 [0,1) 的伪随机数，不依赖 Math.random。 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x9e3779b9) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0
    return ((x ^ (x >>> 15)) >>> 0) / 0x1_0000_0000
  }
}

/** Box–Muller 正态序列：布朗桥需要标准正态增量。 */
function createGaussian(random: () => number): () => number {
  let spare: number | undefined
  return () => {
    if (spare !== undefined) {
      const value = spare
      spare = undefined
      return value
    }
    let first = 0
    let second = 0
    let radius = 0
    do {
      first = random() * 2 - 1
      second = random() * 2 - 1
      radius = first * first + second * second
    } while (radius === 0 || radius >= 1)
    const scale = Math.sqrt((-2 * Math.log(radius)) / radius)
    spare = second * scale
    return first * scale
  }
}
