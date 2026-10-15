/** 宿主维护的内置库类型目录；键名即脚本作用域中的库名。 */
import type {} from '../contracts/library.js'
import type { Series } from '../series/types.js'

/** 技术分析库公开接口。 */
export type TechnicalAnalysisLibrary = {
  /**
   * 简单移动平均（SMA）。
   * @summary 简单移动平均
   * @param source 数据序列，如 close。
   * @param length 周期，正整数。
   * @returns 均线序列；[0] 取当前值，完整窗口之前为 NaN。
   */
  sma(source: Series, length: number): Series
  /**
   * 窗口求和（SUM）。
   * @summary 窗口求和
   * @param source 数据序列，如 volume。
   * @param length 窗口长度，正整数。
   * @returns 求和序列；[0] 取当前窗口结果，完整窗口之前为 NaN。
   */
  sum(source: Series, length: number): Series
  /**
   * 最近 length 根 K 线的最高值，包含当前 K 线。
   * @summary 窗口最高值
   * @param source 数据序列，如 high。
   * @param length 窗口长度，正整数。
   * @returns 最高值序列；[0] 取当前窗口的结果。
   */
  highest(source: Series, length: number): Series
  /**
   * 最近 length 根 K 线的最低值，包含当前 K 线。
   * @summary 窗口最低值
   * @param source 数据序列，如 low。
   * @param length 窗口长度，正整数。
   * @returns 最低值序列；[0] 取当前窗口的结果。
   */
  lowest(source: Series, length: number): Series
  /**
   * 总体标准差（STDDEV），窗口内数值相对窗口均值的偏差，除以 length。
   * @summary 总体标准差
   * @param source 数据序列，如 close。
   * @param length 窗口长度，正整数。
   * @returns 标准差序列；[0] 取当前窗口结果，完整窗口之前为 NaN。
   */
  stddev(source: Series, length: number): Series
  /**
   * 指数移动平均（EMA），以首个完整窗口的 SMA 为初值。
   * @summary 指数移动平均
   * @param source 数据序列，如 close。
   * @param length 周期，正整数。
   * @returns 均线序列；[0] 取当前值。
   */
  ema(source: Series, length: number): Series
  /**
   * 加权移动平均（WMA），越新的值权重越大。
   * @summary 加权移动平均
   * @param source 数据序列，如 close。
   * @param length 周期，正整数。
   * @returns 均线序列；[0] 取当前值。
   */
  wma(source: Series, length: number): Series
  /**
   * 成交量加权移动平均（VWMA），按 Σ(价格×成交量)/Σ(成交量) 计算。
   * @summary 成交量加权移动平均
   * @param source 价格序列，如 close。
   * @param volume 成交量序列。
   * @param length 周期，正整数。
   * @returns 均线序列；[0] 取当前值。
   */
  vwma(source: Series, volume: Series, length: number): Series
  /**
   * 相对强弱指数（RSI），使用 Wilder 平滑；窗口内无下跌（含平盘）为 100。
   * @summary 相对强弱指数
   * @param source 数据序列，如 close。
   * @param length 周期，正整数。
   * @returns RSI 序列，范围 0–100；[0] 取当前值，完整窗口之前为 NaN。
   */
  rsi(source: Series, length: number): Series
  /**
   * 动量（MOM），当前值减去 length 根之前的值。
   * @summary 动量
   * @param source 数据序列，如 close。
   * @param length 回看根数，正整数，缺省为 1。
   * @returns 差值序列，按数值轴绘制；历史不足时为 NaN。
   */
  mom(source: Series, length?: number): Series
  /**
   * 当前值相对 length 根之前的百分比变化（ROC）。
   * @summary 变化率
   * @param source 数据序列，如 close。
   * @param length 回看根数，正整数，缺省为 1。
   * @returns 百分比变化序列；历史不足或基准为 0 时为 NaN。
   */
  roc(source: Series, length?: number): Series
  /**
   * 判断当前 K 线是否发生上穿：left 当前大于 right，上一根小于或等于 right。
   * @summary 上穿
   * @param left 穿越方序列。
   * @param right 被穿越方序列。
   * @returns 发生上穿时为 true。
   */
  crossover(left: Series, right: Series): boolean
  /**
   * 判断当前 K 线是否发生下穿：left 当前小于 right，上一根大于或等于 right。
   * @summary 下穿
   * @param left 穿越方序列。
   * @param right 被穿越方序列。
   * @returns 发生下穿时为 true。
   */
  crossunder(left: Series, right: Series): boolean
}

declare module '../contracts/library.js' {
  /** 内置库的类型目录。 */
  interface LibraryModules {
    ta: TechnicalAnalysisLibrary
  }
}
