/**
 * VM 运行时内部声明。
 *
 * 这些函数由 runtime prelude 提供，对用户脚本不可见；内置库展示源码依赖它们，
 * 因此本文件既参与 tsconfig.runtime 的类型校验，也被生成器拼进内置库展示源码。
 * 运行时与展示程序共用这一份签名，避免两处各写一套。
 */

/** 单个滑动窗口的增删与聚合；index 为绝对 K 线下标。 */
interface RollingWindow {
  push(value: number, index: number): void
  remove(value: number, index: number): void
  /** currentIndex 为当前求值下标，仅偏移类窗口使用。 */
  value(currentIndex: number): number
}

/** 宿主注入：已推进的 K 线条数。 */
declare function __count(): number

/** 数值窗口统一校验，负数、非整数与零都拒绝。 */
declare function __checkLength(length: number): void

/** 返回序列的稳定编号；同一个序列在整轮运行内编号不变。 */
declare function __seriesId(series: object): number

/** 取得或创建缓存的派生序列。 */
declare function __deriveOnce(
  key: string,
  compute: (self: Series, offset: number) => number,
): Series

/** 创建缓存窗口序列；跳读时迭代补齐历史。 */
declare function __rollingSeries(
  key: string,
  source: Series,
  length: number,
  create: () => RollingWindow,
): Series

/** 求和与 SMA 共用累计器。 */
declare function __sumWindow(divisor: number): RollingWindow

/** WMA 累计器：窗口内越新的值权重越大。 */
declare function __weightedWindow(length: number): RollingWindow

/** 总体标准差累计器。 */
declare function __deviationWindow(length: number): RollingWindow

/** 最高/最低值窗口；bars 为 true 时返回相对当前下标的负偏移。 */
declare function __extremeWindow(
  length: number,
  highest: boolean,
  bars?: boolean,
): RollingWindow

/** 摆动点序列；确认发生在右窗口完成时。 */
declare function __pivotSeries(
  source: Series,
  left: number,
  right: number,
  highPoint: boolean,
): Series
