/**
 * 品种选择契约：图表、计算、警报与脚本共用的序列身份。
 *
 * 只描述“看哪个品种、什么周期、什么复权”，不包含图表几何、渲染或交互类型；
 * 因此它可以被无 DOM 的运行时直接引用。
 */
import type { InstrumentDescriptor } from './provider/types.js'

/** 一次序列选择；身份、请求路由与展示都只从 `instrument` 读取。 */
export interface SymbolSpec {
  /** 统一行情模型提供的品种。 */
  instrument: InstrumentDescriptor
  /** K 线周期；缺省按日线。 */
  period?: string
  /** 复权方式；缺省不复权。 */
  adjust?: string
  /** 显式历史查询边界；仅历史窗口查询使用。 */
  startDate?: string
  endDate?: string
  /**
   * 该序列是否支持向前分页；缺省支持。
   * false 表示数据全部由调用方提供，不再向数据源请求更早历史。
   */
  incremental?: boolean
}
