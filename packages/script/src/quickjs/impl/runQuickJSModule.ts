/**
 * QuickJS 脚本运行时：每个脚本一个常驻 Context，一次编译、按 bar 增量执行。
 *
 * 宿主只提供行情与输出桥，Series/ta 全部在 VM prelude 内；同一脚本的 VM 不再按 tick 重建。
 */
import {
  type DrawingObject,
  isPlotKind,
  type PersistedDrawingAnchor,
  type PlotCollection,
  PlotCollector,
  PlotKind,
  timeframeSeconds,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import {
  getQuickJS,
  getQuickJSSync,
  type QuickJSContext,
  type QuickJSHandle,
} from 'quickjs-emscripten'
import type { Bar } from '../../contracts/input.js'
import type { LogEvent } from '../../contracts/output.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { createScriptConsole } from '../../execution/impl/createScriptConsole.js'
import { FIELD_READERS, toOhlcPlotPoint, toPlotPoint } from '../../execution/impl/scriptRuntime.js'
import { createScriptExecutionSession } from '../../execution/session/impl/createScriptExecutionSession.js'
import type {
  DrawingPatch,
  ScriptRuntime,
  ScriptRuntimeExecuteOptions,
  ScriptRuntimeExecuteResult,
} from '../../execution/session/types.js'
import type { CompiledScriptSources } from '../../execution/types.js'
import { requestExecutionSource } from '../../request/impl/requestExecutionSource.js'
import { CURRENT_SYMBOL } from '../../request/impl/symbols.js'
import type {
  RequestExecution,
  RequestValue,
  ScriptRequestContext,
  SecurityRequest,
} from '../../request/types.js'
import {
  DRAWING_API_PRELUDE,
  DRAWING_PRELUDE,
  INDICATOR_PRELUDE,
  LIBRARY_PRELUDE,
  PIVOT_PRELUDE,
  REQUEST_PRELUDE,
  ROLLING_PRELUDE,
  SCRIPT_PRELUDE,
  TIME_PRELUDE,
} from '../generated/runtime.js'
import type { PreparedQuickJSScript, QuickJSScriptDefinition, ScriptParamValue } from '../types.js'
import { readDefinition, readFillCall, readHLineCall, readPlotCall } from './readDefinition.js'
import { SCRIPT_ENUM_GLOBALS } from './scriptEnumGlobals.js'

/** 共享的 WASM 模块类型。 */
type QuickJSModule = Awaited<ReturnType<typeof getQuickJS>>

/** 复用的 WASM 模块；加载一次后所有脚本共用，不共享运行态。 */
let wasmModule: ReturnType<typeof getQuickJS> | undefined

/** 脚本单次执行的时限（毫秒）；库加载、初始化与逐 bar 计算共用。 */
const SCRIPT_TIMEOUT_MS = 1000

/** 常驻 VM 的内存上限；历史缓存与绘图对象都在其中。 */
const SCRIPT_MEMORY_LIMIT = 64 * 1024 * 1024

/** 单次脚本执行的超时状态；中断处理器写入，错误转换时读取。 */
interface ScriptTimeout {
  expired: boolean
}

/** QuickJS 检查点：VM 内对象句柄，只能交回同一运行时。 */
export interface QuickJSCheckpoint {
  readonly handle: QuickJSHandle
}

/** 运行时可变状态；host 函数与逐 bar 循环共享。 */
interface QuickJSState {
  bars: readonly Bar[]
  index: number
  params: Readonly<Record<string, ScriptParamValue>>
  execution: RequestExecution
  collector: PlotCollector
  emit?: (event: LogEvent) => void
  /** 顶层声明阶段产生的日志；首次运行时补发给本次运行的接收者。 */
  pendingLogs: LogEvent[]
  values: RequestValue[]
  failure?: Error
  phase: 'compile' | 'run'
  /** 最后一根 bar 之前的状态下标；库提交检查点时使用。 */
  checkpointIndex: number
  /** 库在本次运行中提交的新检查点。 */
  committedCheckpoint?: QuickJSCheckpoint
}

/** QuickJS 运行时选项；表达式运行时不输出绘图或日志。 */
export interface QuickJSRuntimeOptions {
  readonly expressionId?: string
  readonly onLog?: (event: LogEvent) => void
  readonly params?: Readonly<Record<string, ScriptParamValue>>
  readonly symbol?: string
}

/** 加载 WASM 模块并缓存；供同步入口复用。 */
async function loadQuickJS(): Promise<QuickJSModule> {
  wasmModule ??= getQuickJS()
  return wasmModule
}

/** 预加载 WASM 模块；预加载后同步运行时才可用。 */
export async function preloadQuickJS(): Promise<void> {
  await loadQuickJS()
}

/** 执行一段源码并返回句柄；失败时按阶段抛出 ScriptExecutionError。 */
function evalOrThrow(
  vm: QuickJSContext,
  code: string,
  phase: 'compile' | 'run',
  timeout: ScriptTimeout,
): QuickJSHandle {
  const result = vm.evalCode(code)
  if (result.error) {
    const message = describeFailure(vm, result.error, timeout)
    result.error.dispose()
    throw new ScriptExecutionError(phase, message)
  }
  return result.value
}

/** 调用已编译脚本函数；失败时按运行阶段抛出。 */
function callOrThrow(vm: QuickJSContext, fn: QuickJSHandle, timeout: ScriptTimeout): void {
  const result = vm.callFunction(fn, vm.undefined)
  if (result.error) {
    const message = describeFailure(vm, result.error, timeout)
    result.error.dispose()
    throw new ScriptExecutionError('run', message)
  }
  result.value.dispose()
}

/** 超时中断给出明确时限文案，其余错误沿用 VM 原始信息。 */
function describeFailure(
  vm: QuickJSContext,
  handle: QuickJSHandle,
  timeout: ScriptTimeout,
): string {
  return timeout.expired
    ? `脚本执行超时：已超过 ${SCRIPT_TIMEOUT_MS} 毫秒上限并被中断`
    : describeHandle(vm, handle)
}

/** 把虚拟机错误对象转成可读文本。 */
function describeHandle(vm: QuickJSContext, handle: QuickJSHandle): string {
  const dumped: unknown = vm.dump(handle)
  if (
    dumped &&
    typeof dumped === 'object' &&
    'message' in dumped &&
    typeof dumped.message === 'string'
  ) {
    return dumped.message
  }
  return String(dumped)
}

/** 把参数写成一个全局对象 `params`，键值均为可序列化基本类型。 */
function mountParams(
  vm: QuickJSContext,
  params: Readonly<Record<string, ScriptParamValue>> | undefined,
): void {
  const target = vm.newObject()
  for (const [name, value] of Object.entries(params ?? {})) {
    const owned =
      typeof value === 'number'
        ? vm.newNumber(value)
        : typeof value === 'boolean'
          ? null
          : vm.newString(value)
    const handle = owned ?? (value ? vm.true : vm.false)
    vm.setProp(target, name, handle)
    owned?.dispose()
  }
  vm.setProp(vm.global, 'params', target)
  target.dispose()
}

/** 注入脚本公开枚举；取值来自共享契约，VM 内不重复声明。 */
function mountScriptEnums(vm: QuickJSContext): void {
  for (const [globalName, members] of Object.entries(SCRIPT_ENUM_GLOBALS)) {
    const target = vm.newObject()
    for (const [name, value] of Object.entries(members)) {
      const handle = vm.newString(value)
      vm.setProp(target, name, handle)
      handle.dispose()
    }
    vm.setProp(vm.global, globalName, target)
    target.dispose()
  }
}

/** 注入 __read / __count / __plot / __fill / __hline / __emitRequestResult。 */
function mountHostFunctions(vm: QuickJSContext, state: QuickJSState, timeout: ScriptTimeout): void {
  const console = createScriptConsole(
    (event) => {
      if (state.emit) state.emit(event)
      else state.pendingLogs.push(event)
    },
    () => state.index,
  )
  const consoleHandle = vm.newObject()
  for (const [level, write] of Object.entries(console)) {
    const method = vm.newFunction(level, (...values) => {
      write(...values.map((value) => vm.dump(value)))
      return vm.undefined
    })
    vm.setProp(consoleHandle, level, method)
    method.dispose()
  }
  vm.setProp(vm.global, 'console', consoleHandle)
  consoleHandle.dispose()

  const read = vm.newFunction('__read', (fieldHandle, offsetHandle) => {
    const reader = FIELD_READERS[String(vm.dump(fieldHandle))]
    const offset = Number(vm.dump(offsetHandle))
    const bar = state.bars[state.index - offset]
    return vm.newNumber(bar && reader ? reader(bar) : Number.NaN)
  })
  vm.setProp(vm.global, '__read', read)
  read.dispose()

  const count = vm.newFunction('__count', () => vm.newNumber(state.index + 1))
  vm.setProp(vm.global, '__count', count)
  count.dispose()

  const barCount = vm.newFunction('__barCount', () => vm.newNumber(state.bars.length))
  vm.setProp(vm.global, '__barCount', barCount)
  barCount.dispose()

  const time = vm.newFunction('__timeValue', (mode, period, timestamp, session, timezone) =>
    vm.newNumber(
      timeValue(
        state.execution.time,
        vm.getString(mode),
        vm.getString(period),
        vm.getNumber(timestamp),
        session && !vm.eq(session, vm.undefined) ? vm.getString(session) : undefined,
        timezone && !vm.eq(timezone, vm.undefined) ? vm.getString(timezone) : undefined,
      ),
    ),
  )
  vm.setProp(vm.global, '__timeValue', time)
  time.dispose()

  const seconds = vm.newFunction('__timeframeSeconds', (period) =>
    vm.newNumber(timeframeSeconds(vm.getString(period))),
  )
  vm.setProp(vm.global, '__timeframeSeconds', seconds)
  seconds.dispose()

  const emit = vm.newFunction('__emitRequestResult', (value) => {
    state.values.push(vm.dump(value))
    return vm.undefined
  })
  vm.setProp(vm.global, '__emitRequestResult', emit)
  emit.dispose()

  const plot = vm.newFunction('__plot', (kindHandle, valueHandle, nameHandle, optionsHandle) => {
    if (state.index < 0) {
      state.failure = new ScriptExecutionError('compile', 'plot 只能在 onBar 中调用')
      return vm.undefined
    }
    const kind: unknown = vm.dump(kindHandle)
    if (!isPlotKind(kind)) {
      state.failure = new ScriptExecutionError('run', '未知 plot kind')
      return vm.undefined
    }
    const declaration = readPlotCall(vm.dump(nameHandle), vm.dump(optionsHandle), kind)
    const value: unknown = vm.dump(valueHandle)
    if (declaration.kind === PlotKind.Candle || declaration.kind === PlotKind.Bar) {
      state.collector.onOhlc(declaration, state.index, toOhlcPlotPoint(declaration, value))
      return vm.undefined
    }
    if (value !== null && typeof value !== 'number') {
      state.failure = new ScriptExecutionError('run', 'plot value 需要数值或 null')
      return vm.undefined
    }
    if (value === Infinity || value === -Infinity) {
      state.failure = new ScriptPlotError(declaration.name, state.index)
      return vm.undefined
    }
    state.collector.onPlot(
      declaration.name,
      state.index,
      value === null ? null : toPlotPoint(declaration, value),
      declaration.kind,
      declaration,
    )
    return vm.undefined
  })
  vm.setProp(vm.global, '__plot', plot)
  plot.dispose()

  const hline = vm.newFunction('__hline', (priceHandle, optionsHandle) => {
    if (state.index >= 0) {
      state.failure = new ScriptExecutionError('compile', 'hline 只能在文件顶层声明')
      return vm.undefined
    }
    return vm.newString(
      state.collector.onHLine(readHLineCall(vm.dump(priceHandle), vm.dump(optionsHandle))),
    )
  })
  vm.setProp(vm.global, '__hline', hline)
  hline.dispose()

  const fill = vm.newFunction(
    '__fill',
    (fromHandle, toHandle, colorHandle, titleHandle, optionsHandle) => {
      const call = readFillCall(
        vm.dump(fromHandle),
        vm.dump(toHandle),
        vm.dump(colorHandle),
        vm.dump(titleHandle),
        vm.dump(optionsHandle),
      )
      if (call.kind === 'plot') {
        if (state.index < 0) {
          state.failure = new ScriptExecutionError('compile', 'fill 只能在 onBar 中调用')
          return vm.undefined
        }
        state.collector.onFill(call.declaration, state.index)
      } else {
        if (state.index >= 0) {
          state.failure = new ScriptExecutionError('compile', 'hline 填充只能在文件顶层声明')
          return vm.undefined
        }
        state.collector.onHLineFill(call.from, call.to, call.color, call.title, call.visible)
      }
      return vm.undefined
    },
  )
  vm.setProp(vm.global, '__fill', fill)
  fill.dispose()
}

/** QuickJS 复合值通道会把 NaN 变成 null；只恢复已知数值字段的缺省语义。 */
type DumpedAnchor = Omit<PersistedDrawingAnchor, 'logicalIndex' | 'time' | 'price'> & {
  readonly logicalIndex?: number | null
  readonly time?: number | string | null
  readonly price: number | null
}
type DumpedDrawing = Omit<DrawingObject, 'anchors'> & {
  readonly anchors: readonly DumpedAnchor[]
}
type DumpedDrawingPatch = {
  readonly reset: boolean
  readonly upsert: readonly DumpedDrawing[]
  readonly remove: readonly string[]
}

/** 恢复锚点的 NaN 语义；null 只表示 VM 序列化后的缺值。 */
function normalizeAnchor(anchor: DumpedAnchor): PersistedDrawingAnchor {
  const { logicalIndex, time, price, ...rest } = anchor
  return {
    ...rest,
    ...(logicalIndex === undefined
      ? {}
      : { logicalIndex: logicalIndex === null ? Number.NaN : logicalIndex }),
    ...(time === undefined ? {} : { time: time === null ? Number.NaN : time }),
    price: price === null ? Number.NaN : price,
  }
}

/** 把 VM 增量恢复成领域对象；未变化对象仍由消费端保留原引用。 */
function normalizeDrawingPatch(patch: DumpedDrawingPatch): DrawingPatch {
  return {
    reset: patch.reset,
    remove: patch.remove,
    upsert: patch.upsert.map((drawing) => ({
      ...drawing,
      anchors: drawing.anchors.map(normalizeAnchor),
    })),
  }
}

/** 创建一个常驻 QuickJS 运行时；同一会话内只创建一次，后续按 bar 增量执行。 */
export function createQuickJSScriptRuntime(
  compiled: CompiledScriptSources,
  options: QuickJSRuntimeOptions = {},
): ScriptRuntime<QuickJSCheckpoint> {
  const module = getQuickJSSync()
  const vm = module.newContext()
  const timeout: ScriptTimeout = { expired: false }
  let deadline = Date.now() + SCRIPT_TIMEOUT_MS
  vm.runtime.setInterruptHandler(() => {
    if (Date.now() <= deadline) return false
    timeout.expired = true
    return true
  })
  vm.runtime.setMemoryLimit(SCRIPT_MEMORY_LIMIT)
  vm.runtime.setMaxStackSize(512 * 1024)
  const state: QuickJSState = {
    bars: [],
    index: -1,
    params: options.params ?? {},
    execution: { symbol: options.symbol ?? CURRENT_SYMBOL, results: {} },
    collector: new PlotCollector({ barCount: 0 }),
    // 顶层声明阶段不转发日志；每次 execute 再注入本次运行的接收者。
    emit: undefined,
    pendingLogs: [],
    values: [],
    phase: 'compile',
    checkpointIndex: 0,
  }
  const handles: QuickJSHandle[] = []
  let checkpointHandle: QuickJSHandle | undefined

  try {
    mountHostFunctions(vm, state, timeout)
    mountParams(vm, options.params)
    mountScriptEnums(vm)
    // request.ts 在顶层读取 __requestContext；必须早于任何 prelude 注入。
    evalOrThrow(
      vm,
      `globalThis.__requestContext = ${requestExecutionSource(state.execution)}`,
      'compile',
      timeout,
    ).dispose()
    evalOrThrow(vm, LIBRARY_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, SCRIPT_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, REQUEST_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, TIME_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, ROLLING_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, INDICATOR_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, DRAWING_API_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, DRAWING_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, PIVOT_PRELUDE, 'compile', timeout).dispose()
    for (const library of compiled.libraries) {
      evalOrThrow(vm, library.source, 'compile', timeout).dispose()
      evalOrThrow(
        vm,
        `importLibrary(${JSON.stringify(library.name)})`,
        'compile',
        timeout,
      ).dispose()
    }
    const metadata = evalOrThrow(vm, `${compiled.source}\n;__metadata()`, 'compile', timeout)
    let definition: QuickJSScriptDefinition
    try {
      definition = readDefinition(vm.dump(metadata))
    } finally {
      metadata.dispose()
    }
    // 顶层绘图只记录失败而不中断 VM；准备阶段必须把它当作编译错误抛出。
    if (state.failure) throw state.failure
    const requestsHandle = evalOrThrow(vm, '__requests', 'compile', timeout)
    let requests: readonly SecurityRequest[]
    try {
      requests = vm.dump(requestsHandle)
    } finally {
      requestsHandle.dispose()
    }
    const compiledHandle = evalOrThrow(
      vm,
      options.expressionId === undefined
        ? '__onBar'
        : `() => __emitRequestResult(__copyRequestValue(__requestExpressions.get(${JSON.stringify(options.expressionId)})()))`,
      'compile',
      timeout,
    )
    handles.push(compiledHandle)
    const checkpointFn = evalOrThrow(vm, '__checkpoint', 'compile', timeout)
    handles.push(checkpointFn)
    const rollbackFn = evalOrThrow(vm, '__rollback', 'compile', timeout)
    handles.push(rollbackFn)
    const patchFn = evalOrThrow(vm, '__drawingPatch', 'compile', timeout)
    handles.push(patchFn)
    const drawingCheckpointFn = evalOrThrow(vm, '__drawingCheckpoint', 'compile', timeout)
    handles.push(drawingCheckpointFn)
    const checkpointLibrariesFn = evalOrThrow(vm, '__checkpointLibraries', 'compile', timeout)
    handles.push(checkpointLibrariesFn)

    /** 库在完成期渲染后提交检查点；活动期绘图不进入该检查点。 */
    const commitFn = vm.newFunction('__commitCheckpoint', () => {
      const drawings = vm.callFunction(drawingCheckpointFn, vm.undefined)
      if (drawings.error) {
        const message = describeFailure(vm, drawings.error, timeout)
        drawings.error.dispose()
        throw new ScriptExecutionError('run', message)
      }
      const libraries = vm.callFunction(checkpointLibrariesFn, vm.undefined)
      if (libraries.error) {
        const message = describeFailure(vm, libraries.error, timeout)
        libraries.error.dispose()
        drawings.value.dispose()
        throw new ScriptExecutionError('run', message)
      }
      const checkpoint = vm.newObject()
      const index = vm.newNumber(state.checkpointIndex)
      vm.setProp(checkpoint, 'index', index)
      index.dispose()
      vm.setProp(checkpoint, 'drawings', drawings.value)
      vm.setProp(checkpoint, 'libraries', libraries.value)
      drawings.value.dispose()
      libraries.value.dispose()
      checkpointHandle?.dispose()
      checkpointHandle = checkpoint
      state.committedCheckpoint = { handle: checkpoint }
      return vm.undefined
    })
    vm.setProp(vm.global, '__commitCheckpoint', commitFn)
    commitFn.dispose()

    /** 执行 [startIndex, endIndex)；请求结果按当前运行注入 VM 全局。 */
    function execute(
      input: ScriptRuntimeExecuteOptions,
    ): ScriptRuntimeExecuteResult<QuickJSCheckpoint> {
      state.bars = input.bars
      state.index = input.startIndex - 1
      state.execution = input.execution
      state.committedCheckpoint = undefined
      state.checkpointIndex = input.checkpointIndex ?? input.endIndex - 1
      if (input.emit && state.pendingLogs.length) {
        for (const event of state.pendingLogs) input.emit(event)
        state.pendingLogs.length = 0
      }
      state.emit = input.emit
      state.phase = 'run'
      state.failure = undefined
      deadline = Date.now() + SCRIPT_TIMEOUT_MS
      timeout.expired = false
      state.collector.prepare(input.bars.length, input.startIndex)
      evalOrThrow(
        vm,
        `globalThis.__requestContext = ${requestExecutionSource(input.execution)}`,
        'run',
        timeout,
      ).dispose()
      if (options.expressionId !== undefined) state.values.length = input.startIndex
      try {
        for (state.index = input.startIndex; state.index < input.endIndex; state.index++) {
          callOrThrow(vm, compiledHandle, timeout)
          if (state.failure) throw state.failure
        }
      } catch (error) {
        if (error instanceof ScriptExecutionError || error instanceof ScriptPlotError) throw error
        throw new ScriptExecutionError(
          state.phase,
          error instanceof Error ? error.message : String(error),
        )
      }
      return {
        collection: state.collector.collect(),
        values: state.values,
        ...(state.committedCheckpoint === undefined
          ? {}
          : { checkpoint: state.committedCheckpoint }),
      }
    }

    return {
      definition,
      requests: () => requests,
      execute,
      checkpoint() {
        checkpointHandle?.dispose()
        state.committedCheckpoint = undefined
        const result = vm.callFunction(checkpointFn, vm.undefined)
        if (result.error) {
          const message = describeFailure(vm, result.error, timeout)
          result.error.dispose()
          throw new ScriptExecutionError('run', message)
        }
        checkpointHandle = result.value
        return { handle: result.value }
      },
      rollback(checkpoint) {
        const result = vm.callFunction(rollbackFn, vm.undefined, checkpoint.handle)
        if (result.error) {
          const message = describeFailure(vm, result.error, timeout)
          result.error.dispose()
          throw new ScriptExecutionError('run', message)
        }
        result.value.dispose()
        checkpoint.handle.dispose()
        if (checkpointHandle === checkpoint.handle) checkpointHandle = undefined
      },
      drawingPatch(reset) {
        const result = vm.callFunction(patchFn, vm.undefined, reset ? vm.true : vm.false)
        if (result.error) {
          const message = describeFailure(vm, result.error, timeout)
          result.error.dispose()
          throw new ScriptExecutionError('run', message)
        }
        const dumped: DumpedDrawingPatch = vm.dump(result.value)
        result.value.dispose()
        return normalizeDrawingPatch(dumped)
      },
      dispose() {
        checkpointHandle?.dispose()
        checkpointHandle = undefined
        for (const handle of handles) handle.dispose()
        handles.length = 0
        vm.dispose()
      },
    }
  } catch (error) {
    for (const handle of handles) handle.dispose()
    vm.dispose()
    throw error
  }
}

/** 编译一个源码版本及其库；运行态由常驻会话持有，跨 tick 增量执行。 */
export function prepareQuickJSModule(
  compiled: CompiledScriptSources,
  onLog?: (event: LogEvent) => void,
): PreparedQuickJSScript {
  const session = createScriptExecutionSession({
    createRuntime: ({ expressionId, params, symbol }) =>
      createQuickJSScriptRuntime(compiled, { expressionId, onLog, params, symbol }),
    onLog,
  })
  return Object.freeze({
    definition: session.definition,
    requests(params: Readonly<Record<string, ScriptParamValue>> = {}, symbol = CURRENT_SYMBOL) {
      return session.requests(params, symbol)
    },
    run(
      bars: readonly Bar[],
      params: Readonly<Record<string, ScriptParamValue>> = {},
      context?: ScriptRequestContext,
      startIndex?: number,
    ) {
      return session.run({ bars, params, context, startIndex }).collection
    },
    runDetailed(
      bars: readonly Bar[],
      params: Readonly<Record<string, ScriptParamValue>> = {},
      context?: ScriptRequestContext,
      startIndex?: number,
    ) {
      return session.run({ bars, params, context, startIndex })
    },
    dispose() {
      session.dispose()
    },
  })
}
