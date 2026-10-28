/** 正式指标与临时计算共用的中立行情映射。 */
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import type { KLineData } from '@/foundation/types/price.js'

/** 将图表行情映射成脚本只读 Bar。 */
export function toPlotBar(bar: KLineData): Bar {
  return {
    time: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume === undefined ? 0 : bar.volume,
  }
}
