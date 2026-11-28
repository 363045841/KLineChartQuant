/**
 * 脚本执行会话：把数据层的变化翻译成重放区间，维护主运行时与 Request 运行时的运行态。
 *
 * 只做 tail 增量：追加与末根更新复用状态，历史回补、前置插入、参数或品种变化整段重建。
 */
import type {
  Bar,
  ComputeChange,
  DrawingObject,
  IndicatorSeries,
  ScriptAlertEvent,
} from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../../contracts/log.js'
import type { ScriptParamValue } from '../../../quickjs/types.js'
import type {
  RequestExecution,
  RequestSnapshot,
  RequestValue,
  ScriptRequestContext,
  SecurityRequest,
} from '../../../request/types.js'
import { CURRENT_SYMBOL } from '../../../request/impl/symbols.js'
import { createRequestAligner } from '../../../request/impl/requestAligner.js'
import { applyDrawingDelta } from './drawingDelta.js'
import type {
  ScriptExecutionSession,
  ScriptRuntime,
  ScriptRuntimeExecuteOptions,
  ScriptRuntimeFactory,
  ScriptSessionOutput,
  ScriptSessionRunOptions,
} from '../types.js'

/** 会话创建参数；后端只提供运行时工厂与日志接收者。 */
interface ScriptSessionOptions<Checkpoint> {
  readonly createRuntime: ScriptRuntimeFactory<Checkpoint>
  readonly onLog?: (event: LogEvent) => void
}

/** 每个 Request 的常驻运行时与对齐状态。 */
interface RequestState<Checkpoint> {
  runtime: ScriptRuntime<Checkpoint>
  readonly aligner: ReturnType<typeof createRequestAligner>
  bars: readonly Bar[]
  /** 末根之前的状态；末根更新时据此回滚。 */
  rewind?: Checkpoint
}

/** 参数是否完全相同；键集合与值都参与比较。 */
function sameParams(
  left: Readonly<Record<string, ScriptParamValue>> | undefined,
  right: Readonly<Record<string, ScriptParamValue>>,
): boolean {
  if (left === undefined) return Object.keys(right).length === 0
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every((key) => Object.is(left[key], right[key]))
}

/** 空序列；行情为空时仍返回完整结构，消费端不需要判空。 */
function emptyCollection(): IndicatorSeries {
  return { plots: [], fills: [], hlines: [], hlineFills: [], drawings: [] }
}

/**
 * 创建脚本执行会话。
 *
 * @param options 运行时工厂与日志接收者
 * @returns 宿主唯一入口
 */
export function createScriptExecutionSession<Checkpoint>(
  options: ScriptSessionOptions<Checkpoint>,
): ScriptExecutionSession {
  let main: ScriptRuntime<Checkpoint>
  let mainParams: Readonly<Record<string, ScriptParamValue>> | undefined
  let mainSymbol = CURRENT_SYMBOL
  let plan: readonly SecurityRequest[] = []
  let rewind: Checkpoint | undefined
  let retainedDrawings: readonly DrawingObject[] = []
  let lastLiveBar: { readonly time: number; readonly price: number } | undefined
  /** 上次运行失败后运行态不可信；下一次调用先重建，避免沿用半完成的 bar。 */
  let dirty = false
  const requests = new Map<string, RequestState<Checkpoint>>()

  /** 重建主运行时与全部 Request 运行时；参数、品种或不可恢复的变化使用。 */
  function resetMain(
    params: Readonly<Record<string, ScriptParamValue>>,
    symbol: string,
  ): void {
    if (symbol !== mainSymbol) lastLiveBar = undefined
    main?.dispose()
    for (const state of requests.values()) state.runtime.dispose()
    requests.clear()
    main = options.createRuntime({ params, symbol })
    mainParams = { ...params }
    mainSymbol = symbol
    plan = main.requests()
    rewind = undefined
    retainedDrawings = []
    dirty = false
  }

  /** 对齐一个 Request 快照；返回本次主图可直接使用的取值。 */
  function resolveRequest(
    request: SecurityRequest,
    snapshot: RequestSnapshot,
    params: Readonly<Record<string, ScriptParamValue>>,
    bars: readonly Bar[],
    context: ScriptRequestContext,
    execution: RequestExecution,
  ): readonly RequestValue[] {
    let state = requests.get(request.id)
    if (!state) {
      state = {
        runtime: options.createRuntime({
          expressionId: request.id,
          params,
          symbol: request.symbol,
        }),
        aligner: createRequestAligner(request),
        bars: [],
      }
      requests.set(request.id, state)
    }
    const change = snapshot.change
    let start: number
    if (change.kind === 'append' && state.bars.length > 0) {
      start = change.start
    } else if (
      change.kind === 'update' &&
      change.start === state.bars.length - 1 &&
      state.rewind !== undefined
    ) {
      state.runtime.rollback(state.rewind)
      start = change.start
    } else {
      state.runtime.dispose()
      state.runtime = options.createRuntime({
        expressionId: request.id,
        params,
        symbol: request.symbol,
      })
      state.rewind = undefined
      start = 0
    }
    const executeFrom = (from: number, end: number): readonly RequestValue[] =>
      state!.runtime.execute({
        bars: snapshot.bars,
        startIndex: from,
        endIndex: end,
        params,
        execution,
      }).values
    let values: readonly RequestValue[]
    if (snapshot.bars.length > 1) {
      if (start < snapshot.bars.length - 1) executeFrom(start, snapshot.bars.length - 1)
      state.rewind = state.runtime.checkpoint()
      values = executeFrom(snapshot.bars.length - 1, snapshot.bars.length)
    } else {
      state.rewind = state.runtime.checkpoint()
      values = executeFrom(0, snapshot.bars.length)
    }
    state.bars = snapshot.bars
    return state.aligner.update({
      bars,
      target: snapshot.bars,
      values,
      startIndex: start,
      context,
    })
  }

  /** 解析全部 Request，并组装主运行时的执行上下文。 */
  function resolveRequests(input: {
    readonly bars: readonly Bar[]
    readonly params: Readonly<Record<string, ScriptParamValue>>
    readonly context: ScriptRequestContext | undefined
    readonly symbol: string
  }): RequestExecution {
    if (plan.length === 0) {
      return { symbol: input.symbol, time: input.context?.time, results: {} }
    }
    if (!input.context) throw new Error('Request 需要宿主提供行情上下文')
    const execution: RequestExecution = {
      symbol: input.symbol,
      time: input.context.time,
      results: {},
    }
    const results = execution.results as Record<string, readonly RequestValue[]>
    for (const request of plan) {
      const snapshot = input.context.snapshots.find((item) => item.id === request.id)
      if (!snapshot) throw new Error(`Request 缺少行情快照：${request.id}`)
      results[request.id] = resolveRequest(
        request,
        snapshot,
        input.params,
        input.bars,
        input.context,
        execution,
      )
    }
    return execution
  }

  /** 提交一次主运行结果：应用绘图增量并保留上一轮未变化的绘图对象。 */
  function commit(
    result: { readonly series: IndicatorSeries; readonly alerts: readonly ScriptAlertEvent[] },
    reset: boolean,
    params: Readonly<Record<string, ScriptParamValue>>,
  ): ScriptSessionOutput {
    const drawingDelta = main.drawingDelta(reset)
    retainedDrawings = applyDrawingDelta(retainedDrawings, drawingDelta)
    mainParams = { ...params }
    return {
      ...result.series,
      drawings: retainedDrawings,
      drawingDelta,
      alerts: result.alerts,
    }
  }

  /** 从指定下标执行到末根；末根前记录回滚点，供下一次末根更新复用。 */
  function executeFrom(
    start: number,
    bars: readonly Bar[],
    params: Readonly<Record<string, ScriptParamValue>>,
    execution: RequestExecution,
    realtime: Pick<ScriptRuntimeExecuteOptions, 'liveBarIndex' | 'prevPrice'>,
    reset: boolean,
  ): ScriptSessionOutput {
    if (bars.length > 1 && start < bars.length - 1) {
      main.execute({
        bars,
        startIndex: start,
        endIndex: bars.length - 1,
        params,
        execution,
        emit: options.onLog,
      })
    }
    rewind = main.checkpoint()
    const result = main.execute({
      bars,
      startIndex: bars.length - 1,
      endIndex: bars.length,
      params,
      execution,
      emit: options.onLog,
      checkpointIndex: bars.length - 1,
      ...realtime,
    })
    // 库在完成期提交的检查点包含已完成绘图；下一次末根更新从它回滚。
    rewind = result.checkpoint ?? rewind
    return commit(result, reset, params)
  }

  resetMain({}, CURRENT_SYMBOL)

  return {
    get definition() {
      return main.definition
    },

    requests(params, symbol) {
      if (dirty || !sameParams(mainParams, params) || symbol !== mainSymbol)
        resetMain(params, symbol)
      return plan
    },

    run(input: ScriptSessionRunOptions): ScriptSessionOutput {
      const params = input.params ?? {}
      const symbol = input.context?.symbol ?? mainSymbol
      const bars = input.bars
      const change: ComputeChange = input.change
      if (dirty || !sameParams(mainParams, params) || symbol !== mainSymbol)
        resetMain(params, symbol)

      if (!input.live && change.kind === 'reset') lastLiveBar = undefined
      if (bars.length === 0) {
        if (rewind !== undefined) resetMain(params, symbol)
        return {
          ...emptyCollection(),
          drawingDelta: { reset: true, upsert: [], remove: [] },
          alerts: [],
        }
      }

      let start: number
      let reset = false
      try {
        if (change.kind === 'reset' || change.kind === 'replace') {
          resetMain(params, symbol)
          reset = true
          start = 0
        } else if (change.kind === 'append') {
          start = change.start
        } else if (rewind === undefined || change.start < bars.length - 1) {
          // 末根之外的修订没有可用回滚点，整段重放。
          resetMain(params, symbol)
          reset = true
          start = 0
        } else {
          main.rollback(rewind)
          start = bars.length - 1
        }

        const execution = resolveRequests({ bars, params, context: input.context, symbol })
        const liveBar = input.live ? bars[bars.length - 1] : undefined
        const prevPrice =
          liveBar && lastLiveBar?.time === liveBar.time ? lastLiveBar.price : undefined
        if (liveBar) lastLiveBar = { time: liveBar.time, price: liveBar.close }
        const realtime = liveBar
          ? { liveBarIndex: bars.length - 1, ...(prevPrice === undefined ? {} : { prevPrice }) }
          : {}
        return executeFrom(start, bars, params, execution, realtime, reset)
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
