/**
 * 深度聚合：把各所返回的原始买卖档位折成可跨所比较的指标。
 *
 * 三条口径决策（面板的所有数字都建立在这上面）：
 *
 * 1. **按价格区间统计，不按档数**。各所档数上限不同（Binance 5000 档覆盖 ±1.3%、
 *    Bybit 200 档覆盖 ±0.5%），「前 N 档加起来」在不同交易所之间不可比。统一换算成
 *    「距中间价 ±X% 内的名义金额」，并把覆盖不足的区间标 `complete=false`。
 *
 * 2. **同时给全深度与近端两个口径**。文章的背离判断依赖「全深度买盘多、近端卖盘多」，
 *    缺任一侧都无法判断。近端固定取最优 NEAR_LEVELS 档。
 *
 * 3. **价格墙用相对阈值**。绝对金额阈值会让大所永远有墙、小所永远没有。这里改成
 *    「单档名义金额超过本侧档位中位数的 WALL_MULTIPLE 倍」，各所各自判定、可比。
 */
import {
  DEPTH_BANDS,
  type DepthBand,
  type DepthBandStats,
  type DepthLevel,
  type DepthSnapshot,
  NEAR_LEVELS,
  type OrderflowVenue,
  type PriceWall,
  WALL_MULTIPLE,
} from '../types'

/** 价格墙最多返回几个。 */
const MAX_WALLS = 5

/**
 * 默认用于展示与背离判定的区间。
 *
 * 实测五家单次深度请求的实际覆盖只有 ±0.2%~±0.5%（见 docs/design/data/orderflow-panel.md），
 * 更宽的区间（±1%、±2%）返回的都是同一批挂单、且必然标 `complete=false`。
 * 因此面板统一用 ±0.5% 作为代表口径，而不是假装统计到了 ±5%。
 */
export const DEPTH_BANDS_DEFAULT: DepthBand = 0.5

/** 构造深度快照的输入。 */
export interface BuildDepthInput {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 交易对 */
  readonly symbol: string
  /** 采集时刻（毫秒） */
  readonly timestamp: number
  /** 买盘档位（数量已归一化为基础币），按价格降序 */
  readonly bids: readonly DepthLevel[]
  /** 卖盘档位（数量已归一化为基础币），按价格升序 */
  readonly asks: readonly DepthLevel[]
}

/**
 * 取数组的中位数。
 *
 * @param values 已排序或未排序的数值
 * @returns 中位数；空数组返回 0
 */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * 计算某一侧在给定价格区间内的名义金额。
 *
 * @param levels 档位
 * @param midPrice 中间价
 * @param bandPct 区间百分比（正数）
 * @returns 名义金额与是否有档位落在区间边界之外（即覆盖完整）
 */
function sumWithin(
  levels: readonly DepthLevel[],
  midPrice: number,
  bandPct: number,
): { notional: number; covered: boolean } {
  const limit = (bandPct / 100) * midPrice
  let notional = 0
  let covered = false
  for (const level of levels) {
    const distance = Math.abs(level.price - midPrice)
    if (distance <= limit) {
      notional += level.notional
    } else {
      // 出现区间外的档位，说明这一侧确实覆盖到了 band 以外，统计是完整的
      covered = true
    }
  }
  // 最远档仍在区间内 → 该区间可能被截断，标记不完整
  return { notional, covered }
}

/**
 * 计算失衡度。
 *
 * @param bid 买盘金额
 * @param ask 卖盘金额
 * @returns (买 − 卖) / (买 + 卖)；两侧都为零时返回 0
 */
function imbalanceOf(bid: number, ask: number): number {
  const total = bid + ask
  return total > 0 ? (bid - ask) / total : 0
}

/**
 * 找出价格墙。
 *
 * 判定标准：单档名义金额 ≥ 本侧档位名义金额中位数 × WALL_MULTIPLE。
 * 用中位数而不是均值——墙本身会把均值拉高，导致它自己不达标。
 *
 * @param levels 档位
 * @param side 方向
 * @param midPrice 中间价
 * @returns 价格墙（未排序）
 */
function findWalls(
  levels: readonly DepthLevel[],
  side: 'bid' | 'ask',
  midPrice: number,
): PriceWall[] {
  if (levels.length === 0) return []
  const baseline = median(levels.map((level) => level.notional))
  if (baseline <= 0) return []
  const threshold = baseline * WALL_MULTIPLE
  const walls: PriceWall[] = []
  for (const level of levels) {
    if (level.notional < threshold) continue
    walls.push({
      side,
      price: level.price,
      notional: level.notional,
      distancePct: ((level.price - midPrice) / midPrice) * 100,
    })
  }
  return walls
}

/**
 * 构造深度快照。
 *
 * @param input 原始档位与元信息
 * @returns 深度快照
 * @throws RangeError 买盘或卖盘为空（无法定义中间价）
 */
export function buildDepthSnapshot(input: BuildDepthInput): DepthSnapshot {
  const { venue, symbol, timestamp, bids, asks } = input
  if (bids.length === 0 || asks.length === 0) {
    throw new RangeError(`${venue} ${symbol} 深度为空（bids=${bids.length}, asks=${asks.length}）`)
  }
  const bestBid = bids[0].price
  const bestAsk = asks[0].price
  const midPrice = (bestBid + bestAsk) / 2

  const bands: DepthBandStats[] = DEPTH_BANDS.map((band) => {
    const bid = sumWithin(bids, midPrice, band)
    const ask = sumWithin(asks, midPrice, band)
    return {
      band,
      bidNotional: bid.notional,
      askNotional: ask.notional,
      imbalance: imbalanceOf(bid.notional, ask.notional),
      complete: bid.covered && ask.covered,
    }
  })

  const nearBids = bids.slice(0, NEAR_LEVELS)
  const nearAsks = asks.slice(0, NEAR_LEVELS)
  const nearBidNotional = nearBids.reduce((sum, level) => sum + level.notional, 0)
  const nearAskNotional = nearAsks.reduce((sum, level) => sum + level.notional, 0)

  const bidCoveragePct = ((midPrice - bids[bids.length - 1].price) / midPrice) * 100
  const askCoveragePct = ((asks[asks.length - 1].price - midPrice) / midPrice) * 100

  const walls = [...findWalls(bids, 'bid', midPrice), ...findWalls(asks, 'ask', midPrice)]
    .sort((left, right) => right.notional - left.notional)
    .slice(0, MAX_WALLS)

  return {
    venue,
    symbol,
    timestamp,
    midPrice,
    bestBid,
    bestAsk,
    spreadRatio: (bestAsk - bestBid) / midPrice,
    bidLevels: bids.length,
    askLevels: asks.length,
    bidCoveragePct,
    askCoveragePct,
    bands,
    nearImbalance: imbalanceOf(nearBidNotional, nearAskNotional),
    nearBidNotional,
    nearAskNotional,
    walls,
  }
}

/**
 * 取指定区间宽度上的失衡度。
 *
 * @param snapshot 深度快照
 * @param band 区间
 * @returns 失衡度；该区间不在快照里时返回 null
 */
export function imbalanceAt(snapshot: DepthSnapshot, band: DepthBand): number | null {
  const found = snapshot.bands.find((item) => item.band === band)
  return found === undefined ? null : found.imbalance
}

/**
 * 判断是否存在「深度背离」：全深度与近端失衡方向相反。
 *
 * 这是文章里逻辑最硬的一条判据——总买盘多但近端卖盘多，通常意味着买单挂在远处、
 * 近端在派发。判定要求两侧失衡都超过 `threshold`，避免把噪声当背离。
 *
 * @param snapshot 深度快照
 * @param band 用于代表「全深度」的区间
 * @param threshold 最小失衡绝对值
 * @returns 背离方向；不存在背离返回 null
 */
export function detectDepthDivergence(
  snapshot: DepthSnapshot,
  band: DepthBand,
  threshold = 0.05,
): 'bid-far-ask-near' | 'ask-far-bid-near' | null {
  const deep = imbalanceAt(snapshot, band)
  if (deep === null) return null
  const near = snapshot.nearImbalance
  if (Math.abs(deep) < threshold || Math.abs(near) < threshold) return null
  if (deep > 0 && near < 0) return 'bid-far-ask-near'
  if (deep < 0 && near > 0) return 'ask-far-bid-near'
  return null
}
