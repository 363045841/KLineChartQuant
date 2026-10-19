/** 宿主维护的内置库类型目录；键名即脚本作用域中的库名。 */
import type {} from '../contracts/library.js'
import type { Series } from '../series/types.js'

/** 技术分析库公开接口。 */
export type TechnicalAnalysisLibrary = {
  /**
   * 当前值严格高于前 length 根中的所有有效值，不要求逐根上涨。
   * @summary 上涨判断
   * @param source 数据序列，如 close。
   * @param length 回看根数，正整数，不包含当前根。
   * @returns 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。
   */
  rising(source: Series, length: number): boolean
  /**
   * 当前值严格低于前 length 根中的所有有效值，不要求逐根下跌。
   * @summary 下跌判断
   * @param source 数据序列，如 close。
   * @param length 回看根数，正整数，不包含当前根。
   * @returns 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。
   */
  falling(source: Series, length: number): boolean
  /**
   * 当前值减去 length 根之前的值。
   * @summary 数值变化
   * @param source 数据序列，如 volume。
   * @param length 回看根数，正整数，缺省为 1。
   * @returns 差值序列；历史不足或任一端为 NaN 时为 NaN。
   */
  change(source: Series, length?: number): Series
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
   * 最近 length 根 K 线最高值相对当前 K 线的偏移，负值或 0。
   * @summary 最高值偏移
   * @param source 数据序列，如 high。
   * @param length 窗口长度，正整数。
   * @returns 偏移序列；并列最高取更早一根，完整窗口之前为 NaN。
   */
  highestbars(source: Series, length: number): Series
  /**
   * 最近 length 根 K 线最低值相对当前 K 线的偏移，负值或 0。
   * @summary 最低值偏移
   * @param source 数据序列，如 low。
   * @param length 窗口长度，正整数。
   * @returns 偏移序列；并列最低取更早一根，完整窗口之前为 NaN。
   */
  lowestbars(source: Series, length: number): Series
  /**
   * Wilder 平滑均线（RMA），alpha = 1 / length，以首个完整窗口 SMA 初始化。
   * @summary Wilder 平滑均线
   * @param source 数据序列，如 close。
   * @param length 周期，正整数。
   * @returns 均线序列；完整窗口之前为 NaN。
   */
  rma(source: Series, length: number): Series
  /**
   * 对称加权均线，固定 4 根窗口，权重由旧到新为 1/6、2/6、2/6、1/6。
   * @summary 对称加权均线
   * @param source 数据序列，如 close。
   * @returns 均线序列；前 3 根为 NaN。
   */
  swma(source: Series): Series
  /**
   * Arnaud Legoux 均线（ALMA），高斯权重中心位于 offset × (length − 1)。
   * @summary Arnaud Legoux 均线
   * @param source 数据序列，如 close。
   * @param length 窗口长度，正整数。
   * @param offset 高斯中心在窗口中的相对位置，0–1，缺省 0.85。
   * @param sigma 高斯宽度，有限正数，缺省 6。
   * @param floor 为 true 时对中心取下整，缺省 false。
   * @returns 均线序列；完整窗口之前为 NaN。
   */
  alma(
    source: Series,
    length: number,
    offset?: number,
    sigma?: number,
    floor?: boolean,
  ): Series
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
   * 双重指数均线：2×EMA(source)−EMA(EMA(source))。
   * @summary 双重指数均线
   * @param source 数据序列。
   * @param length 正整数周期，各层 EMA 以完整窗口均值初始化。
   * @returns DEMA 序列，前 2×(length−1) 根为 NaN。
   */
  dema(source: Series, length: number): Series
  /**
   * 三重指数均线：3×EMA1−3×EMA2+EMA3。
   * @summary 三重指数均线
   * @param source 数据序列。
   * @param length 正整数周期，各层 EMA 以完整窗口均值初始化。
   * @returns TEMA 序列，前 3×(length−1) 根为 NaN。
   */
  tema(source: Series, length: number): Series
  /**
   * Tillson T3，以六层 EMA 及成交量因子系数组合平滑价格。
   * @summary Tillson T3 均线
   * @param source 数据序列。
   * @param length 正整数周期。
   * @param volumeFactor 平滑因子，有限数值 0–1，缺省 0.7，不读取成交量。
   * @returns T3 序列，前 6×(length−1) 根为 NaN；周期 1 时等于输入。
   */
  t3(source: Series, length: number, volumeFactor?: number): Series
  /**
   * 三角均线：SMA(SMA(source, ceil(length/2)), floor(length/2)+1)。
   * @summary 三角移动平均
   * @param source 数据序列。
   * @param length 正整数周期。
   * @returns TRIMA 序列，前 length−1 根为 NaN。
   */
  trima(source: Series, length: number): Series
  /**
   * MACD，快慢 EMA 与信号 EMA 均以首个有效值初始化，从该位置逐根输出。
   * @summary 指数平滑异同平均线
   * @param source 价格序列，如 close。
   * @param fastLength 快周期，正整数。
   * @param slowLength 慢周期，正整数。
   * @param signalLength 信号周期，正整数。
   * @returns [DIF, DEA, DIF-DEA] 三个序列；柱体不翻倍，NaN 处留空，后续有效值重新初始化。
   */
  macd(
    source: Series,
    fastLength: number,
    slowLength: number,
    signalLength: number,
  ): readonly [Series, Series, Series]
  /**
   * 加权移动平均（WMA），越新的值权重越大。
   * @summary 加权移动平均
   * @param source 数据序列，如 close。
   * @param length 周期，正整数。
   * @returns 均线序列；[0] 取当前值。
   */
  wma(source: Series, length: number): Series
  /**
   * Hull 移动平均，组合 WMA(2×WMA(source, floor(length/2))−WMA(source, length), round(sqrt(length)))。
   * @summary Hull 移动平均
   * @param source 数据序列。
   * @param length 正整数周期，派生窗口最小为 1。
   * @returns 均线序列，完整组合窗口之前为 NaN。
   */
  hma(source: Series, length: number): Series
  /**
   * 线性回归曲线：对窗口做最小二乘拟合，返回相对当前根向前 offset 根的拟合值。
   * @summary 线性回归
   * @param source 数据序列，如 close。
   * @param length 窗口长度，正整数。
   * @param offset 向前偏移的根数，整数，缺省 0（当前根）。
   * @returns 回归值序列；完整窗口之前为 NaN。
   */
  linreg(source: Series, length: number, offset?: number): Series
  /**
   * 顺势指标：(source−SMA)/(0.015×平均绝对偏差)。
   * @summary 顺势指标
   * @param source 数据序列，通常为 (high+low+close)/3。
   * @param length 正整数周期。
   * @returns CCI 序列；窗口不足为 NaN，平均绝对偏差为零时为 0。
   */
  cci(source: Series, length: number): Series
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
   * 随机指标：100 × (source − 窗口最低) / (窗口最高 − 窗口最低)。
   * @summary 随机指标
   * @param source 数据序列，如 close。
   * @param high 最高价序列，如 high。
   * @param low 最低价序列，如 low。
   * @param length 窗口长度，正整数。
   * @returns 随机指标序列，范围 0–100；完整窗口之前为 NaN，零幅窗口输出 50。
   */
  stoch(source: Series, high: Series, low: Series, length: number): Series
  /**
   * 平均真实波幅（ATR），首个完整窗口取真实波幅均值，之后使用 Wilder 平滑。
   * @summary 平均真实波幅
   * @param length 周期，正整数。
   * @returns ATR 序列；第一根真实波幅为 high-low，完整窗口之前为 NaN。
   */
  atr(length: number): Series
  /**
   * Supertrend，保留原生指标的上涨初始方向与 ATR 通道递推规则。
   * @summary 超级趋势
   * @param multiplier ATR 倍数，有限正数。
   * @param atrPeriod ATR 周期，正整数。
   * @returns [趋势线序列, 方向序列]；-1 为上涨、1 为下跌，预热期间两者均为 NaN。
   */
  supertrend(multiplier: number, atrPeriod: number): readonly [Series, Series]
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
   * Chande 动量振荡器：100 × (涨幅和 − 跌幅和) / (涨幅和 + 跌幅和)，窗口含 length 个差分。
   * @summary 钱德动量振荡器
   * @param source 数据序列，如 close。
   * @param length 差分窗口，正整数。
   * @returns CMO 序列，范围 -100–100；完整窗口之前为 NaN，平盘（分母为零）为 0。
   */
  cmo(source: Series, length: number): Series
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
