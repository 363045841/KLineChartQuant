/**
 * 脚本执行公共件：逐 bar 上下文构造与输入参数解析。
 *
 * runEngine（异步流式）与 executeScript（同步内存）共用这两个函数，
 * 保证两条链路的上下文形态与参数默认值完全一致。
 */
import type { Bar } from '../../contracts/input.js'
import type { OutputSink } from '../../contracts/output.js'
import type { Ctx, InputDef, InputSchema } from '../../contracts/script.js'
import { ScriptPlotError } from '../../errors.js'

/** 为单根 bar 构造执行上下文，按脚本指定的 Plot id 输出绘图点。 */
export function createBarContext(bar: Bar, barIndex: number, sink: OutputSink): Ctx {
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    plot(value, options) {
      // NaN 保留为空点语义；无穷大是运行错误，不能静默丢弃。
      if (value === Infinity || value === -Infinity) throw new ScriptPlotError(options.id, barIndex)
      sink.onPlot(options.id, barIndex, { value, color: options.color })
    },
  }
}

/**
 * 由输入声明解析出运行参数：以默认值为底，用 overrides 覆盖。
 *
 * 每次调用都返回全新对象，调用方之间的参数互不影响。
 */
export function resolveScriptParams<P>(inputs: InputSchema<P>, overrides?: Partial<P>): P {
  const params: Record<string, unknown> = {}
  for (const [key, input] of Object.entries(inputs as Record<string, InputDef<unknown>>)) {
    params[key] = overrides?.[key as keyof P] ?? input.default
  }
  return params as P
}
