/** 脚本执行会话：常驻运行时、区间执行、依赖驱动的重置与 Request 增量对齐。 */
import type {
  Bar,
  ComputeDependency,
  ComputeRange,
  DrawingObject,
  PlotCollection,
} from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../../contracts/output.js'
import type { ScriptParamValue } from '../../../quickjs/types.js'
import { createRequestAligner, type RequestAligner } from '../../../request/impl/requestAligner.js'
import { CURRENT_SYMBOL } from '../../../request/impl/symbols.js'
import type {
  RequestExecution,
  RequestValue,
  ScriptRequestContext,
  SecurityRequest,
} from '../../../request/types.js'
import type {
  ScriptExecutionSession,
  ScriptRuntime,
  ScriptRuntimeExecuteResult,
  ScriptRuntimeFactory,
  ScriptSessionOutput,
  ScriptSessionRunOptions,
} from '../types.js'
import { firstChangedBar } from './changeRange.js'
import { applyDrawingDelta } from './drawingDelta.js'

/** 会话装配选项；dependency 来自编译期推断，会话不再自行判断状态性。 */
export interface ScriptSessionOptions<Checkpoint> {
  readonly createRuntime: ScriptRuntimeFactory<Checkpoint>
  readonly dependency: ComputeDependency
  readonly replayOnUpdate: boolean
  readonly onLog?: (event: LogEvent) => void
}

/** 单个 Request 的常驻表达式运行时与对齐器。 */
interface RequestState<Checkpoint> {
  runtime: ScriptRuntime<Checkpoint>
  aligner: RequestAligner
  bars: readonly Bar[]
  checkpoint?: Checkpoint
  fresh: boolean
}

/** 参数逐键比较；参数变化会改变顶层请求声明，必须重建运行时。 */
function sameParams(
  previous: Readonly<Record<string, ScriptParamValue>> | undefined,
  next: Readonly<Record<string, ScriptParamValue>>,
): boolean {
  if (previous === undefined) return false
  const previousKeys = Object.keys(previous)
  const nextKeys = Object.keys(next)
  return (
    previousKeys.length === nextKeys.length &&
    previousKeys.every((key) => previous[key] === next[key])
  )
}

/** 空集合也带绘图字段，宿主不必区分“无绘图”和“未计算”。 */
function emptyCollection(): PlotCollection {
  return { plots: [], fills: [], drawings: [] }
}

/** 创建一个脚本执行会话；主运行时在准备阶段建立，后续按区间执行。 */
export function createScriptExecutionSession<Checkpoint>(
  options: ScriptSessionOptions<Checkpoint>,
): ScriptExecutionSession {
  let main: ScriptRuntime<Checkpoint>
  let mainParams: Readonly<Record<string, ScriptParamValue>> | undefined
  let mainSymbol = CURRENT_SYMBOL
  let plan: readonly SecurityRequest[] = []
  let previousBars: readonly Bar[] = []
  let checkpoint: Checkpoint | undefined
  let retainedDrawings: readonly DrawingObject[] = []
  let runtimeFresh = true
  /** 上次运行失败后运行态不可信；下一次调用先重建，避免沿用半完成的 bar。 */
  let dirty = false
  const requests = new Map<string, RequestState<Checkpoint>>()

  /** 重建主运行时与全部 Request 运行时；参数、品种或历史失效时使用。 */
  function resetMain(params: Readonly<Record<string, ScriptParamValue>>, symbol: string): void {
    main?.dispose()
    for (const state of requests.values()) state.runtime.dispose()
    requests.clear()
    main = options.createRuntime({ params, symbol })
    mainParams = { ...params }
    mainSymbol = symbol
    plan = main.requests()
    previousBars = []
    checkpoint = undefined
    retainedDrawings = []
    runtimeFresh = true
  }

  /** 解析并更新所有 Request 对齐结果；主图区间起点决定尾部重算范围。 */
  function resolveRequestExecution(input: {
    bars: readonly Bar[]
    params: Readonly<Record<string, ScriptParamValue>>
    context: ScriptRequestContext | undefined
    startIndex: number
    symbol: string
  }): { execution: RequestExecution; historyChanged: boolean } {
    if (plan.length === 0) {
      return {
        execution: { symbol: input.symbol, time: input.context?.time, results: {} },
        historyChanged: false,
      }
    }
    if (!input.context) throw new Error('Request 需要宿主提供行情上下文')
    // 目标周期历史被修正时，之前的主图对齐结果全部可能失效；保守地整段重算。
    let historyChanged = false
    for (const request of plan) {
      const state = requests.get(request.id)
      if (!state || state.bars.length === 0) continue
      const snapshot = input.context.snapshots.find((item) => item.id === request.id)
      if (!snapshot) throw new Error(`Request 缺少行情快照：${request.id}`)
      if (firstChangedBar(state.bars, snapshot.bars) < state.bars.length - 1) historyChanged = true
    }
    const alignerStart = historyChanged ? 0 : input.startIndex
    const results: Record<string, readonly RequestValue[]> = {}
    for (const request of plan) {
      const snapshot = input.context.snapshots.find((item) => item.id === request.id)
      if (!snapshot) throw new Error(`Request 缺少行情快照：${request.id}`)
      let state = requests.get(request.id)
      if (!state) {
        state = {
          runtime: options.createRuntime({
            expressionId: request.id,
            params: input.params,
            symbol: request.symbol,
          }),
          aligner: createRequestAligner(request),
          bars: [],
          fresh: true,
        }
        requests.set(request.id, state)
      }
      const change = firstChangedBar(state.bars, snapshot.bars)
      let from: number
      if (state.fresh || state.bars.length === 0) {
        from = 0
        state.fresh = false
      } else if (change >= state.bars.length - 1 && state.checkpoint !== undefined) {
        from = Math.min(change, state.bars.length - 1)
        state.runtime.rollback(state.checkpoint)
      } else {
        state.runtime.dispose()
        state.runtime = options.createRuntime({
          expressionId: request.id,
          params: input.params,
          symbol: request.symbol,
        })
        state.checkpoint = undefined
        from = 0
      }
      const execution: RequestExecution = {
        symbol: request.symbol,
        time: input.context.time,
        results: {},
      }
      let values: readonly RequestValue[]
      if (snapshot.bars.length > 1) {
        state.runtime.execute({
          bars: snapshot.bars,
          startIndex: from,
          endIndex: snapshot.bars.length - 1,
          params: input.params,
          execution,
        })
        state.checkpoint = state.runtime.checkpoint()
        values = state.runtime.execute({
          bars: snapshot.bars,
          startIndex: snapshot.bars.length - 1,
          endIndex: snapshot.bars.length,
          params: input.params,
          execution,
        }).values
      } else {
        state.checkpoint = state.runtime.checkpoint()
        values = state.runtime.execute({
          bars: snapshot.bars,
          startIndex: 0,
          endIndex: snapshot.bars.length,
          params: input.params,
          execution,
        }).values
      }
      results[request.id] = state.aligner.update({
        bars: input.bars,
        target: snapshot.bars,
        values,
        startIndex: alignerStart,
        context: input.context,
      })
      state.bars = snapshot.bars.slice()
    }
    return {
      execution: { symbol: input.symbol, time: input.context.time, results },
      historyChanged,
    }
  }

  /** 提交一次主运行结果：应用绘图增量并保留上一轮未变化的绘图对象。 */
  function commit(
    result: ScriptRuntimeExecuteResult<Checkpoint>,
    reset: boolean,
    bars: readonly Bar[],
    params: Readonly<Record<string, ScriptParamValue>>,
  ): ScriptSessionOutput {
    const drawingDelta = main.drawingDelta(reset)
    retainedDrawings = applyDrawingDelta(retainedDrawings, drawingDelta)
    previousBars = bars.slice()
    mainParams = { ...params }
    runtimeFresh = false
    return {
      collection: { ...result.collection, drawings: retainedDrawings },
      drawingDelta,
    }
  }

  /** 有状态执行：从 from 起跑到末根；最后一根单独提交检查点。 */
  function runStateful(
    from: number,
    bars: readonly Bar[],
    params: Readonly<Record<string, ScriptParamValue>>,
    execution: RequestExecution,
  ): ScriptSessionOutput {
    const reset = runtimeFresh
    if (bars.length > 1) {
      main.execute({
        bars,
        startIndex: from,
        endIndex: bars.length - 1,
        params,
        execution,
        emit: options.onLog,
      })
      checkpoint = main.checkpoint()
      const result = main.execute({
        bars,
        startIndex: bars.length - 1,
        endIndex: bars.length,
        params,
        execution,
        emit: options.onLog,
        checkpointIndex: bars.length - 1,
      })
      checkpoint = result.checkpoint ?? checkpoint
      return commit(result, reset, bars, params)
    }
    checkpoint = main.checkpoint()
    const result = main.execute({
      bars,
      startIndex: 0,
      endIndex: 1,
      params,
      execution,
      emit: options.onLog,
      checkpointIndex: 0,
    })
    checkpoint = result.checkpoint ?? checkpoint
    return commit(result, reset, bars, params)
  }

  resetMain({}, CURRENT_SYMBOL)

  return {
    get definition() {
      return main.definition
    },

    requests(params, symbol) {
      if (dirty || !sameParams(mainParams, params) || symbol !== mainSymbol) {
        resetMain(params, symbol)
        dirty = false
      }
      return plan
    },

    run(input: ScriptSessionRunOptions): ScriptSessionOutput {
      const params = input.params ?? {}
      const symbol = input.context?.symbol ?? mainSymbol
      if (dirty || !sameParams(mainParams, params) || symbol !== mainSymbol) {
        resetMain(params, symbol)
        dirty = false
      }
      try {
        const bars = input.bars
        if (bars.length === 0) {
          if (!runtimeFresh) resetMain(params, symbol)
          return {
            collection: emptyCollection(),
            drawingDelta: { reset: true, upsert: [], remove: [] },
          }
        }
        let range: ComputeRange = input.range ?? { start: 0, end: bars.length }
        const stateful = options.dependency.kind === 'stateful'
        const previousLength = previousBars.length
        // 宿主给有状态指标的计算范围覆盖全历史；会话按实际输入差异证明尾部可复用。
        // 首次运行、前插、截断到历史或历史修正仍重建，不把扩大后的范围当作变更事实。
        if (stateful) range = { start: firstChangedBar(previousBars, bars), end: bars.length }
        let tailOnly =
          !options.replayOnUpdate &&
          previousLength > 0 &&
          bars.length >= previousLength &&
          range.start >= previousLength - 1
        if (stateful && !tailOnly) resetMain(params, symbol)

        const requestResult = resolveRequestExecution({
          bars,
          params,
          context: input.context,
          startIndex: range.start,
          symbol,
        })
        if (requestResult.historyChanged) {
          resetMain(params, symbol)
          range = { start: 0, end: bars.length }
          tailOnly = false
        }
        const execution = requestResult.execution

        if (stateful) {
          if (tailOnly && checkpoint !== undefined) main.rollback(checkpoint)
          const from = tailOnly ? Math.min(range.start, previousLength - 1, bars.length - 1) : 0
          return runStateful(from, bars, params, execution)
        }

        // 无状态：只重算区间，区间外的派生缓存与结果保持不变。
        main.invalidate(range.start)
        const result = main.execute({
          bars,
          startIndex: range.start,
          endIndex: range.end,
          params,
          execution,
          emit: options.onLog,
        })
        return commit(result, runtimeFresh, bars, params)
      } catch (error) {
        dirty = true
        throw error
      }
    },

    dispose() {
      main.dispose()
      for (const state of requests.values()) state.runtime.dispose()
      requests.clear()
    },
  }
}
