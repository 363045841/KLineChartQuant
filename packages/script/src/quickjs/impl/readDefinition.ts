/** 校验从 QuickJS 跨边界读取的指标元数据，不信任用户脚本的对象结构。 */
import type { PlotDeclaration, PlotFillDeclaration } from '@363045841yyt/klinechart-plot-contracts'
import { ScriptExecutionError } from '../../errors.js'
import type { QuickJSScriptDefinition, ScriptParamValue } from '../types.js'

/** 判断普通对象，便于逐字段收窄脚本返回值。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 输入只允许有限数值、字符串和布尔值。 */
function isParam(value: unknown): value is ScriptParamValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

/** 可选字段校验，缺省值由 Plot 采集器补齐。 */
function optional(value: unknown, kind: 'string' | 'number' | 'boolean'): boolean {
  return (
    value === undefined || (typeof value === kind && (kind !== 'number' || Number.isFinite(value)))
  )
}

/** 检查声明式 Plot 的公共字段与各图形的专用字段。 */
function isPlot(value: unknown): value is PlotDeclaration {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return false
  if (
    !optional(value.label, 'string') ||
    !optional(value.color, 'string') ||
    !optional(value.offset, 'number') ||
    !optional(value.visible, 'boolean')
  )
    return false
  if (value.kind === 'line') {
    return (
      optional(value.width, 'number') &&
      (value.dash === undefined ||
        (Array.isArray(value.dash) &&
          value.dash.every((item: unknown) => typeof item === 'number' && Number.isFinite(item))))
    )
  }
  if (value.kind === 'histogram') return optional(value.baseline, 'number')
  return value.kind === 'points' && optional(value.radius, 'number')
}

/** 检查填充引用和可选样式。 */
function isFill(value: unknown): value is PlotFillDeclaration {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    optional(value.color, 'string') &&
    optional(value.reverseColor, 'string') &&
    optional(value.opacity, 'number') &&
    optional(value.visible, 'boolean')
  )
}

/** 读取已初始化脚本的定义；缺字段或错误类型统一作为编译错误报告。 */
export function readDefinition(value: unknown): QuickJSScriptDefinition {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !optional(value.displayName, 'string') ||
    (value.pane !== undefined && value.pane !== 'main' && value.pane !== 'sub') ||
    !isRecord(value.inputs)
  ) {
    throw new ScriptExecutionError('compile', '指标需要 name、inputs，pane 只能是 main 或 sub')
  }
  const inputs: QuickJSScriptDefinition['inputs'] = {}
  for (const [key, declaration] of Object.entries(value.inputs)) {
    if (
      !isRecord(declaration) ||
      !isParam(declaration.default) ||
      !optional(declaration.title, 'string')
    ) {
      throw new ScriptExecutionError('compile', `无效输入参数：${key}`)
    }
    inputs[key] = {
      default: declaration.default,
      ...(typeof declaration.title === 'string' ? { title: declaration.title } : {}),
    }
  }
  const plots: unknown = value.plots
  const fills: unknown = value.fills
  if (plots !== undefined && (!Array.isArray(plots) || !plots.every(isPlot))) {
    throw new ScriptExecutionError('compile', '无效 plots 声明')
  }
  if (fills !== undefined && (!Array.isArray(fills) || !fills.every(isFill))) {
    throw new ScriptExecutionError('compile', '无效 fills 声明')
  }
  return {
    name: value.name,
    ...(typeof value.displayName === 'string' ? { displayName: value.displayName } : {}),
    ...(value.pane === 'main' || value.pane === 'sub' ? { pane: value.pane } : {}),
    inputs,
    ...(Array.isArray(plots) && plots.every(isPlot) ? { plots } : {}),
    ...(Array.isArray(fills) && fills.every(isFill) ? { fills } : {}),
  }
}
