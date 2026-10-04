/** K 线原生比较投影：主品种保留 OHLC，比较折线归一到主品种可见首价。 */
import type { KLineData } from '../../../foundation/types/price.js'
import { findVisibleBarRange } from '../../utils/visibleBarIndex.js'
import type { ComparisonData, ComparisonProjection, ComparisonSeriesProjection } from '../types.js'

/** 百分比比较只接受有限正价格。 */
function hasValidPrice(item: KLineData): boolean {
  return Number.isFinite(item.close) && item.close > 0
}

/** 在主图时间轴上投影比较折线，共享起点、OHLC 极值和真实数据缺口。 */
export function projectComparison(
  primary: ReadonlyArray<KLineData>,
  data: ComparisonData,
  range: { start: number; end: number },
  centers: ReadonlyArray<number>,
  scrollLeft: number,
  paneWidth: number,
): ComparisonProjection | null {
  const visible = findVisibleBarRange(range, centers, scrollLeft, paneWidth)
  const last = Math.min(visible.last, primary.length - 1)
  let baselineIndex = visible.first
  while (baselineIndex <= last) {
    const item = primary[baselineIndex]
    if (item && hasValidPrice(item)) break
    baselineIndex++
  }
  const baseItem = primary[baselineIndex]
  if (baselineIndex > last || !baseItem) return null
  const basePrice = baseItem.close
  let min = basePrice
  let max = basePrice
  // 主品种始终画原始 K 线，其影线必须参与共同价格范围。
  for (let index = visible.first; index <= last; index++) {
    const item = primary[index]
    if (!item) continue
    for (const price of [item.open, item.high, item.low, item.close]) {
      if (Number.isFinite(price) && price > 0) {
        min = Math.min(min, price)
        max = Math.max(max, price)
      }
    }
  }

  const series: ComparisonSeriesProjection[] = []
  for (const [identity, items] of data) {
    const byTimestamp = new Map(items.map((item) => [item.timestamp, item]))
    let ownBaselineIndex = baselineIndex
    let baseline: KLineData | undefined
    for (; ownBaselineIndex <= last; ownBaselineIndex++) {
      const timestamp = primary[ownBaselineIndex]?.timestamp
      const item = timestamp === undefined ? undefined : byTimestamp.get(timestamp)
      if (item && hasValidPrice(item)) {
        baseline = item
        break
      }
    }
    if (!baseline) continue
    const points: Array<{ index: number; price: number | null }> = []
    for (let index = ownBaselineIndex; index <= last; index++) {
      const timestamp = primary[index]?.timestamp
      const item = timestamp === undefined ? undefined : byTimestamp.get(timestamp)
      const equivalent =
        item && hasValidPrice(item)
          ? basePrice + basePrice * ((item.close - baseline.close) / baseline.close)
          : null
      const price = equivalent !== null && Number.isFinite(equivalent) ? equivalent : null
      points.push({ index, price })
      if (price !== null) {
        min = Math.min(min, price)
        max = Math.max(max, price)
      }
    }
    series.push({
      identity,
      baselineIndex: ownBaselineIndex,
      baselineClose: baseline.close,
      points,
    })
  }
  return { baselineIndex, basePrice, min, max, series }
}
