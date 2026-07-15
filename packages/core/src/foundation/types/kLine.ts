import type { KLineData } from './price'

export type kLineTrend = 'up' | 'down' | 'flat'

export function getKLineTrend(KLineData: KLineData, preClose?: number): kLineTrend {
  if (KLineData.close > KLineData.open) return 'up'
  if (KLineData.close < KLineData.open) return 'down'

  // 一字板 / doji: close === open → use preClose to determine direction
  if (preClose !== undefined) {
    if (KLineData.close === KLineData.open && KLineData.open > preClose) return 'up'
    if (KLineData.close === KLineData.open && KLineData.open < preClose) return 'down'
  }

  return 'flat'
}
