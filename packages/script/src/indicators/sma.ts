/** SMA 指标：在主图绘制收盘价的简单移动平均线。 */
import { defineIndicator } from '../defineIndicator.js'
import { input } from '../input.js'

export const sma = defineIndicator({
  name: 'SMA',
  pane: 'main',
  inputs: {
    period: input(20, '周期'),
  },
  /** 计算均线并输出当前值，历史不足时保留空点。 */
  onBar(ctx, params) {
    const average = ctx.ta.sma(ctx.close, params.period)
    ctx.plot(average[0], { id: 'sma' })
  },
})
