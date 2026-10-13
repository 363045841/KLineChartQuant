/**
 * 脚本执行公共件：逐 bar 上下文构造与输入参数解析。
 *
 * runEngine（异步流式）与 executeScript（同步内存）共用这两个函数，
 * 保证两条链路的上下文形态与参数默认值完全一致。
 */
import { resolveInputDefaults } from '@363045841yyt/klinechart-plot-contracts'
import type { OutputSink } from '../../contracts/output.js'
import type { Ctx, InputSchema } from '../../contracts/script.js'
import { ScriptPlotError } from '../../errors.js'
import { libraryEnvironment } from '../../libraryRuntime/impl/defaultEnvironment.js'
import type { SeriesRuntime } from '../../series/impl/seriesRuntime.js'

/** 绑定环境中的库与行情序列，构造逐 bar 执行上下文。 */
export function createBarContext(runtime: SeriesRuntime, sink: OutputSink): Ctx {
  return {
    ...libraryEnvironment.libraries(),
    open: runtime.open,
    high: runtime.high,
    low: runtime.low,
    close: runtime.close,
    volume: runtime.volume,
    time: runtime.time,
    plot(value, options) {
      // NaN 保留为空点语义；无穷大是运行错误，不能静默丢弃。
      if (value === Infinity || value === -Infinity)
        throw new ScriptPlotError(options.id, runtime.index)
      sink.onPlot(options.id, runtime.index, { value, color: options.color })
    },
  }
}

/**
 * 由输入声明解析出运行参数：以默认值为底，用 overrides 覆盖。
 *
 * 每次调用都返回全新对象，调用方之间的参数互不影响。
 */
export function resolveScriptParams<P>(inputs: InputSchema<P>, overrides?: Partial<P>): P {
  const params = resolveInputDefaults(inputs) as Record<string, unknown>
  for (const key of Object.keys(params)) {
    params[key] = overrides?.[key as keyof P] ?? params[key]
  }
  return params as P
}
