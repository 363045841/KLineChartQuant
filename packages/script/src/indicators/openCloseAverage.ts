/**
 * 指标模板：Open/Close 平均值。
 *
 * 这是 Script 引擎最早的验证指标，逐 bar 计算 (open + close) / n 并画到图上。
 * 本文件只描述「一个指标长什么样」，不含任何引擎 / Plot 实现。
 */
import { defineIndicator } from '../defineIndicator.js'
import { input } from '../input.js'

/** Open/Close 平均值：输出 (open + close) / n。 */
export const openCloseAverage = defineIndicator({
  /** 指标名称。 */
  name: 'OC Average',

  /** 注册到主图。 */
  pane: 'sub',

  /** 输入参数声明：n 为除数，缺省 2 即两价均值。 */
  inputs: {
    n: input(2, '除数'),
    a: input(0, '偏移量'),
  },

  /**
   * 每根 K 线执行一次：读取当前 bar 的 open / close，求和后除以 n 用 Plot 系函数输出。
   */
  onBar(ctx, params) {
    const average = (ctx.open[0] + ctx.close[0]) / params.n + params.a
    ctx.plot(average, { id: 'oc-average', color: '#26a69a' })
    ctx.plot(ctx.high[0], { id: 'oc-high' })
    ctx.plot(ctx.low[0], { id: 'oc-low' })
  },
})
