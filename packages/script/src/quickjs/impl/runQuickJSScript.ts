/**
 * QuickJS 脚本执行器：宿主只提供行情与输出桥，Series/ta 全部在 VM prelude 内。
 *
 * 每个脚本一个独立 Context，一次编译成函数、逐 bar 调用；不向宿主 globalThis 注入。
 * 异步入口用于首次加载 WASM；预加载后可用同步入口，供 core 的同步 compute 调用。
 */
import {
  Color,
  IndicatorType,
  isPlotKind,
  type PlotCollection,
  PlotCollector,
  type PlotDeclaration,
  PlotKind,
  type PlotPoint,
  ShapeLocation,
  ShapeSize,
  ShapeStyle,
} from '@363045841yyt/klinechart-plot-contracts'
import {
  getQuickJS,
  getQuickJSSync,
  type QuickJSContext,
  type QuickJSHandle,
} from 'quickjs-emscripten'
import type { Bar } from '../../contracts/input.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import {
  INDICATOR_PRELUDE,
  LIBRARY_PRELUDE,
  ROLLING_PRELUDE,
  SCRIPT_PRELUDE,
} from '../generated/runtime.js'
import {
  PaneKind,
  type PreparedQuickJSScript,
  type QuickJSLibrary,
  type QuickJSRunOptions,
  type QuickJSScriptDefinition,
  type ScriptParamValue,
} from '../types.js'
import { builtinLibraries } from './builtinLibraries.js'
import { compileScript } from './compileScript.js'
import { readDefinition, readPlotCall } from './readDefinition.js'

/** 共享的 WASM 模块类型。 */
type QuickJSModule = Awaited<ReturnType<typeof getQuickJS>>

/** 复用的 WASM 模块；加载一次后所有脚本共用，不共享运行态。 */
let wasmModule: ReturnType<typeof getQuickJS> | undefined

/** 加载 WASM 模块并缓存；供同步入口复用。 */
async function loadQuickJS(): Promise<QuickJSModule> {
  wasmModule ??= getQuickJS()
  return wasmModule
}

/** 预加载 WASM 模块；预加载后 runQuickJSScriptSync 才可用。 */
export async function preloadQuickJS(): Promise<void> {
  await loadQuickJS()
}

/** 各行情字段的取值函数；字段名固定，未知字段返回 NaN。 */
const FIELD_READERS: Readonly<Record<string, (bar: Bar) => number>> = {
  open: (bar) => bar.open,
  high: (bar) => bar.high,
  low: (bar) => bar.low,
  close: (bar) => bar.close,
  volume: (bar) => bar.volume,
  time: (bar) => bar.time,
}

/** 用已有行情执行脚本源码，返回逐 bar 汇聚的 PlotCollection。 */
export async function runQuickJSScript(options: QuickJSRunOptions): Promise<PlotCollection> {
  await loadQuickJS()
  return runQuickJSScriptSync(options)
}

/** 同步执行脚本；必须先 preloadQuickJS，否则抛出。 */
export function runQuickJSScriptSync(options: QuickJSRunOptions): PlotCollection {
  return runWithContext(getQuickJSSync(), {
    ...options,
    ...compileSources(options.source, options.libraries),
  }).collection
}

/** 初始化完整文件并读取声明，供注册层生成指标目录。 */
export function readQuickJSScriptDefinitionSync(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): QuickJSScriptDefinition {
  return runWithContext(getQuickJSSync(), { ...compileSources(source, libraries), bars: [] })
    .definition
}

/** 用户脚本与外部库共用一个编译边界；内置库已由构建过程编译。 */
function compileSources(source: string, libraries: readonly QuickJSLibrary[] = []) {
  return {
    source: compileScript(source),
    libraries: [
      ...builtinLibraries,
      ...libraries.map((library) => ({
        name: library.name,
        source: compileScript(library.source),
      })),
    ],
  }
}

/** 编译一个源码版本及其库；注册层持有快照，行情重算时不再转译 TS。 */
export function prepareQuickJSScript(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): PreparedQuickJSScript {
  const module = getQuickJSSync()
  const compiled = compileSources(source, libraries)
  const definition = runWithContext(module, { ...compiled, bars: [] }).definition
  return Object.freeze({
    definition,
    /** 使用既有编译产物执行，VM 状态不在多次运行间共享。 */
    run(bars: readonly Bar[], params?: Readonly<Record<string, ScriptParamValue>>) {
      return runWithContext(module, { ...compiled, bars, params }).collection
    },
  })
}

/** 脚本单次执行的时限（毫秒）；库加载、初始化与逐 bar 计算共用。 */
const SCRIPT_TIMEOUT_MS = 1000

/** 单次脚本执行的超时状态；中断处理器写入，错误转换时读取。 */
interface ScriptTimeout {
  expired: boolean
}

/** 在单个 Context 内完成编译与逐 bar 执行。 */
function runWithContext(
  module: QuickJSModule,
  options: QuickJSRunOptions,
): {
  definition: QuickJSScriptDefinition
  collection: PlotCollection
} {
  const { source, bars } = options
  let collector: PlotCollector | undefined
  const vm = module.newContext()
  // 校验和逐 bar 执行共用同一时限，死循环不能永久阻塞主线程。
  const timeout: ScriptTimeout = { expired: false }
  const deadline = Date.now() + SCRIPT_TIMEOUT_MS
  vm.runtime.setInterruptHandler(() => {
    if (Date.now() <= deadline) return false
    timeout.expired = true
    return true
  })
  vm.runtime.setMemoryLimit(32 * 1024 * 1024)
  vm.runtime.setMaxStackSize(512 * 1024)
  // 宿主游标决定 __read 相对哪根 K 线；逐 bar 推进。
  const cursor = { index: -1 }
  let failure: Error | undefined

  try {
    mountHostFunctions(
      vm,
      bars,
      cursor,
      () => collector,
      (error) => {
        failure ??= error
      },
    )
    mountParams(vm, options.params)
    mountScriptEnums(vm)
    evalOrThrow(vm, LIBRARY_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, SCRIPT_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, ROLLING_PRELUDE, 'compile', timeout).dispose()
    evalOrThrow(vm, INDICATOR_PRELUDE, 'compile', timeout).dispose()
    for (const library of options.libraries ?? []) {
      evalOrThrow(vm, library.source, 'compile', timeout).dispose()
      evalOrThrow(
        vm,
        `importLibrary(${JSON.stringify(library.name)})`,
        'compile',
        timeout,
      ).dispose()
    }
    const metadata = evalOrThrow(vm, `${source}\n;__metadata()`, 'compile', timeout)
    let definition: QuickJSScriptDefinition
    try {
      definition = readDefinition(vm.dump(metadata))
    } finally {
      metadata.dispose()
    }
    if (failure) throw failure
    collector = new PlotCollector({
      barCount: bars.length,
      plots: definition.plots,
      fills: definition.fills,
    })
    const compiled = evalOrThrow(vm, '__onBar', 'compile', timeout)
    try {
      for (let index = 0; index < bars.length; index++) {
        cursor.index = index
        callOrThrow(vm, compiled, timeout)
        if (failure) throw failure
      }
    } finally {
      compiled.dispose()
    }
    return { definition, collection: collector.collect() }
  } finally {
    vm.dispose()
  }
}

/** 注入 __read / __count / __plot 三个宿主函数。 */
function mountHostFunctions(
  vm: QuickJSContext,
  bars: readonly Bar[],
  cursor: { index: number },
  getCollector: () => PlotCollector | undefined,
  onError: (error: Error) => void,
): void {
  const read = vm.newFunction('__read', (fieldHandle, offsetHandle) => {
    const reader = FIELD_READERS[String(vm.dump(fieldHandle))]
    const offset = Number(vm.dump(offsetHandle))
    const bar = bars[cursor.index - offset]
    return vm.newNumber(bar && reader ? reader(bar) : Number.NaN)
  })
  vm.setProp(vm.global, '__read', read)
  read.dispose()

  const count = vm.newFunction('__count', () => vm.newNumber(cursor.index + 1))
  vm.setProp(vm.global, '__count', count)
  count.dispose()

  const plot = vm.newFunction('__plot', (kindHandle, valueHandle, optionsHandle) => {
    const collector = getCollector()
    if (!collector || cursor.index < 0) {
      onError(new ScriptExecutionError('compile', 'plot 只能在 onBar 中调用'))
      return vm.undefined
    }
    const value: unknown = vm.dump(valueHandle)
    const kind: unknown = vm.dump(kindHandle)
    if (!isPlotKind(kind)) {
      onError(new ScriptExecutionError('run', '未知 plot kind'))
      return vm.undefined
    }
    const declaration = readPlotCall(vm.dump(optionsHandle), kind)
    if (value !== null && typeof value !== 'number') {
      onError(new ScriptExecutionError('run', 'plot value 需要数值或 null'))
      return vm.undefined
    }
    if (value === Infinity || value === -Infinity) {
      onError(new ScriptPlotError(declaration.id, cursor.index))
      return vm.undefined
    }
    collector.onPlot(
      declaration.id,
      cursor.index,
      value === null ? null : toPlotPoint(declaration, value),
      kind,
      declaration,
    )
    return vm.undefined
  })
  vm.setProp(vm.global, '__plot', plot)
  plot.dispose()
}

/** 箭头方向色优先于公共 color；其余 kind 直接用调用颜色。 */
function resolvePointColor(declaration: PlotDeclaration, value: number): string | undefined {
  if (declaration.kind !== 'arrow') return declaration.color
  return (value > 0 ? declaration.colorUp : declaration.colorDown) ?? declaration.color
}

/** 组装跨边界绘图点：颜色缺省时不写入字段，留给 Plot 层回落声明样式。 */
function toPlotPoint(declaration: PlotDeclaration, value: number): PlotPoint {
  const color = resolvePointColor(declaration, value)
  return {
    value,
    ...(color === undefined ? {} : { color }),
    ...(declaration.textColor === undefined ? {} : { textColor: declaration.textColor }),
  }
}

/** 把参数写成一个全局对象 `params`，键值均为可序列化基本类型。 */
function mountParams(
  vm: QuickJSContext,
  params: Readonly<Record<string, ScriptParamValue>> | undefined,
): void {
  const target = vm.newObject()
  for (const [name, value] of Object.entries(params ?? {})) {
    // true/false 是 context 预建句柄，不能 dispose。
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
  for (const [globalName, members] of Object.entries({
    Color,
    PaneKind,
    PlotKind,
    IndicatorType,
    ShapeStyle,
    ShapeLocation,
    ShapeSize,
  })) {
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
