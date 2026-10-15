/** QuickJS 脚本执行的输入与选项契约。 */

import type {
  IndicatorType,
  InputSchema,
  PlotDeclaration,
  PlotFillDeclaration,
} from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../contracts/input.js'

/** 可以在脚本中作为 `params` 读取的输入值。 */
export type ScriptParamValue = number | string | boolean

/** 指标注册位置；脚本声明、编辑器与宿主共用同一组取值。 */
export enum PaneKind {
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
  /** 指标名称；同时是对外身份与展示名。 */
  readonly name: string
  readonly pane?: PaneKind
  /** 业务分类；缺省由 core 归入 other。 */
  readonly indicatorType?: IndicatorType
  readonly inputs: InputSchema<Record<string, ScriptParamValue>>
  readonly plots?: readonly PlotDeclaration[]
  readonly fills?: readonly PlotFillDeclaration[]
}

/** 一次 QuickJS 脚本运行的配置。 */
export interface QuickJSRunOptions {
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
  run(
    bars: readonly Bar[],
    params?: Readonly<Record<string, ScriptParamValue>>,
  ): import('@363045841yyt/klinechart-plot-contracts').PlotCollection
}
