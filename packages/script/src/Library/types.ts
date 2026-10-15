/** 宿主维护的内置库类型目录；键名即脚本作用域中的库名。 */
import type { Series } from '../series/types.js'

/** 技术分析库公开接口。 */
export type TechnicalAnalysisLibrary = {
  /** 简单移动平均序列，完整窗口之前为 NaN。 */
  sma(source: Series, length: number): Series
  /** 指数移动平均序列，以首个完整窗口 SMA 初始化。 */
  ema(source: Series, length: number): Series
  /** 加权移动平均序列，窗口内越新的值权重越大，完整窗口之前为 NaN。 */
  wma(source: Series, length: number): Series
  /** 成交量加权移动平均序列，Σ(source×volume)/Σ(volume)；完整窗口之前或窗口成交量之和为 0 时为 NaN。 */
  vwma(source: Series, volume: Series, length: number): Series
  /** Wilder RSI 序列，平盘为 50。 */
  rsi(source: Series, length: number): Series
  /** 窗口最高值序列。 */
  highest(source: Series, length: number): Series
  /** 窗口最低值序列。 */
  lowest(source: Series, length: number): Series
  /** 当前是否发生上穿。 */
  crossover(left: Series, right: Series): boolean
  /** 当前是否发生下穿。 */
  crossunder(left: Series, right: Series): boolean
}

declare module '../contracts/library.js' {
  /** 内置库的类型目录。 */
  interface LibraryModules {
    ta: TechnicalAnalysisLibrary
  }
}
