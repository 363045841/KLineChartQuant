/** QuickJS 脚本执行的输入与选项契约。 */

import type { InputSchema } from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../contracts/input.js'
import type { RequestExecution, ScriptRequestContext, SecurityRequest } from '../request/types.js'

/** 可以在脚本中作为 `params` 读取的输入值。 */
export type ScriptParamValue = number | string | boolean

/** 指标渲染位置；脚本声明、编辑器与宿主共用同一组取值。 */
export enum Position {
  /** 叠加到主图。 */
  Main = 'main',
  /** 独立副图。 */
  Sub = 'sub',
}

/** VM 库文件；源码通过 defineLibrary(name, exports) 声明公开成员。 */
export interface QuickJSLibrary {
  readonly name: string
  readonly source: string
}

/** 从完整脚本文件声明中读取的元数据，函数仍留在 VM 内执行。 */
export interface QuickJSScriptDefinition {
  /** 用户可修改的指标显示名称；注册身份由宿主维护。 */
  readonly name: string
  /**
   * 指标渲染位置。
   *
   * | 取值 | 含义 |
   * | --- | --- |
   * | `Position.Main` | 叠加到主图，与 K 线共用主图价格轴 |
   * | `Position.Sub` | 独立副图 |
   */
  readonly position: Position
  readonly inputs: InputSchema<Record<string, ScriptParamValue>>
}

/** 一次 QuickJS 脚本运行的配置。 */
export interface QuickJSRunOptions {
  readonly requestContext?: ScriptRequestContext
  readonly requestExecution?: RequestExecution
  /** 完整 TS 文件，通过 defineIndicator 声明元数据与 onBar。 */
  readonly source: string
  /** 已加载的行情，按时间升序。 */
  readonly bars: readonly Bar[]
  /** 脚本参数，作为全局 `params` 注入。 */
  readonly params?: Readonly<Record<string, ScriptParamValue>>
  readonly libraries?: readonly QuickJSLibrary[]
}

/** 一个源码版本的编译快照；每次运行仍使用独立 VM 上下文。 */
export interface PreparedQuickJSScript {
  readonly definition: QuickJSScriptDefinition
  requests(
    params?: Readonly<Record<string, ScriptParamValue>>,
    symbol?: string,
  ): readonly SecurityRequest[]
  run(
    bars: readonly Bar[],
    params?: Readonly<Record<string, ScriptParamValue>>,
    context?: ScriptRequestContext,
  ): import('@363045841yyt/klinechart-plot-contracts').PlotCollection
}
