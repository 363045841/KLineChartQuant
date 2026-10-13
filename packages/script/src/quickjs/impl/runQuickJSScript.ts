/**
 * QuickJS 脚本执行器：宿主只提供行情与输出桥，Series/ta 全部在 VM prelude 内。
 *
 * 每个脚本一个独立 Context，一次编译成函数、逐 bar 调用；不向宿主 globalThis 注入。
 * 异步入口用于首次加载 WASM；预加载后可用同步入口，供 core 的同步 compute 调用。
 */
import { type PlotCollection, PlotCollector } from '@363045841yyt/klinechart-plot-contracts'
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
  PLOT_KIND_PRELUDE,
  SCRIPT_PRELUDE,
} from '../generated/runtime.js'
import type {
  QuickJSLibrary,
  QuickJSRunOptions,
  QuickJSScriptDefinition,
  ScriptParamValue,
} from '../types.js'
import { builtinLibraries } from './builtinLibraries.js'
import { readDefinition } from './readDefinition.js'

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
  const module = await loadQuickJS()
  return runWithContext(module, options).collection
}

/** 同步执行脚本；必须先 preloadQuickJS，否则抛出。 */
export function runQuickJSScriptSync(options: QuickJSRunOptions): PlotCollection {
  return runWithContext(getQuickJSSync(), options).collection
}

/** 初始化完整文件并读取声明，供注册层生成指标目录。 */
export function readQuickJSScriptDefinitionSync(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): QuickJSScriptDefinition {
  return runWithContext(getQuickJSSync(), { source, bars: [], libraries }).definition
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
  // 保存校验和逐 bar 执行共用资源上限，死循环不能永久阻塞主线程。
  const deadline = Date.now() + 1000
  vm.runtime.setInterruptHandler(() => Date.now() > deadline)
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
    evalOrThrow(vm, LIBRARY_PRELUDE, 'compile').dispose()
    evalOrThrow(vm, SCRIPT_PRELUDE, 'compile').dispose()
    evalOrThrow(vm, PLOT_KIND_PRELUDE, 'compile').dispose()
    evalOrThrow(vm, INDICATOR_PRELUDE, 'compile').dispose()
    for (const library of [...builtinLibraries, ...(options.libraries ?? [])]) {
      evalOrThrow(vm, library.source, 'compile').dispose()
      evalOrThrow(vm, `importLibrary(${JSON.stringify(library.name)})`, 'compile').dispose()
    }
    const metadata = evalOrThrow(vm, `${source}\n;__metadata()`, 'compile')
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
    const compiled = evalOrThrow(vm, '__onBar', 'compile')
    try {
      for (let index = 0; index < bars.length; index++) {
        cursor.index = index
        callOrThrow(vm, compiled)
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

  const plot = vm.newFunction('__plot', (idHandle, valueHandle, colorHandle, kindHandle) => {
    const collector = getCollector()
    if (!collector || cursor.index < 0) {
      onError(new ScriptExecutionError('compile', 'plot 只能在 onBar 中调用'))
      return vm.undefined
    }
    const id = String(vm.dump(idHandle))
    const value = Number(vm.dump(valueHandle))
    const color = vm.dump(colorHandle)
    const kind: unknown = vm.dump(kindHandle)
    if (value === Infinity || value === -Infinity) {
      onError(new ScriptPlotError(id, cursor.index))
    } else {
      collector.onPlot(
        id,
        cursor.index,
        typeof color === 'string' ? { value, color } : { value },
        kind === 'line' || kind === 'histogram' || kind === 'points' ? kind : undefined,
      )
    }
    return vm.undefined
  })
  vm.setProp(vm.global, '__plot', plot)
  plot.dispose()
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

/** 执行一段源码并返回句柄；失败时按阶段抛出 ScriptExecutionError。 */
function evalOrThrow(vm: QuickJSContext, code: string, phase: 'compile' | 'run'): QuickJSHandle {
  const result = vm.evalCode(code)
  if (result.error) {
    const message = describeHandle(vm, result.error)
    result.error.dispose()
    throw new ScriptExecutionError(phase, message)
  }
  return result.value
}

/** 调用已编译脚本函数；失败时按运行阶段抛出。 */
function callOrThrow(vm: QuickJSContext, fn: QuickJSHandle): void {
  const result = vm.callFunction(fn, vm.undefined)
  if (result.error) {
    const message = describeHandle(vm, result.error)
    result.error.dispose()
    throw new ScriptExecutionError('run', message)
  }
  result.value.dispose()
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
