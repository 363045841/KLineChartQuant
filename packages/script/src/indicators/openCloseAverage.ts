/**
 * 指标模板：Open/Close 平均值。
 *
 * 这是 Script 引擎最早的验证指标，逐 bar 计算 (open + close) / 2 并画到图上。
 * 本文件只描述「一个指标长什么样」，不含任何引擎 / Plot 实现。
 */
import { defineIndicator } from '../defineIndicator.js'

/** Open/Close 平均值：输出 (open + close) / 2。 */
export const openCloseAverage = defineIndicator({
  /** 指标名称。 */
  name: 'OC Average',

  /** 输入参数声明；本指标无参数。 */
  inputs: {},

  /**
   * 每根 K 线执行一次：读取当前 bar 的 open / close，求平均后用 Plot 系函数输出。
   */
  onBar(ctx) {
    const average = (ctx.open + ctx.close) / 2
    ctx.plot(average, { id: 'oc-average', color: '#26a69a' })
  },
})
