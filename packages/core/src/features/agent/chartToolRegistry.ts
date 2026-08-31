// 本文件注册可由 UI 与 Agent 共同调用的 Chart Agent 方法，并提供统一参数校验。
import { type Static, type TSchema } from 'typebox'
import { Value } from 'typebox/value'

const TOOL_INPUT_ERROR_LIMIT = 5
const TOOL_INPUT_SUMMARY_MAX_LENGTH = 200

/** 图表工具允许声明的副作用等级。 */
export type ChartToolSafety = 'read-only' | 'destructive'

/** Agent 调用工具时提供的非业务执行控制信息。 */
export interface ChartToolExecutionContext {
  readonly signal: AbortSignal
  progress(update: { readonly label: string; readonly current?: number; readonly total?: number }): void
}

/** 直接标注在 Core 图表 API 上的静态工具元数据。 */
export interface ChartToolConfig<TParameters extends TSchema = TSchema> {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: TParameters
  readonly safety: ChartToolSafety
  readonly executionMode?: 'parallel' | 'sequential'
}

/** 已注册的图表方法及其统一执行入口。 */
export interface RegisteredChartTool {
  readonly config: ChartToolConfig
  execute(target: object, input: unknown, context: ChartToolExecutionContext): Promise<unknown>
  summarizeInput(input: unknown): string
}

const registeredChartTools = new Map<string, RegisteredChartTool>()

/** 递归冻结注册表拥有的 schema 副本，避免外部修改嵌套工具契约。 */
function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || visited.has(value)) return value
  visited.add(value)
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key), visited)
  }
  return Object.freeze(value)
}

/** 将 TypeBox 校验显式声明为 TypeScript 类型守卫。 */
function isToolInput<TParameters extends TSchema>(
  schema: TParameters,
  input: unknown,
): input is Static<TParameters> {
  return Value.Check(schema, input)
}

/** 返回有限条字段错误，供 Agent 根据原因修正下一次调用。 */
function requireToolInput<TParameters extends TSchema>(
  schema: TParameters,
  input: unknown,
): Static<TParameters> {
  if (isToolInput(schema, input)) return input
  const errors: string[] = []
  for (const error of Value.Errors(schema, input)) {
    errors.push(`${error.instancePath || '/'}: ${error.message}`)
    if (errors.length === TOOL_INPUT_ERROR_LIMIT) break
  }
  throw new TypeError(`The tool input is invalid: ${errors.join('; ') || 'Schema validation failed.'}`)
}

/** 将已校验参数压缩为安全的 UI 调试摘要。 */
function summarizeToolInput(input: unknown): string {
  let serialized: string
  try {
    serialized = JSON.stringify(input) ?? 'undefined'
  } catch {
    return '[Unserializable tool input]'
  }
  return serialized.length <= TOOL_INPUT_SUMMARY_MAX_LENGTH
    ? serialized
    : `${serialized.slice(0, TOOL_INPUT_SUMMARY_MAX_LENGTH - 3)}...`
}

/**
 * 标准方法装饰器：注册 Core 图表 API，UI 与 Agent 通过同一方法调用业务能力。
 * 方法的第二个可选参数只承载取消和进度等执行控制，不属于领域输入。
 */
export function Tool<TParameters extends TSchema>(config: ChartToolConfig<TParameters>) {
  return function <T extends object>(
    value: (
      this: T,
      input: Static<TParameters>,
      context?: ChartToolExecutionContext,
    ) => Promise<unknown>,
    context: ClassMethodDecoratorContext<T>,
  ) {
    if (context.private || context.static || typeof context.name !== 'string') {
      throw new TypeError('[Tool] must decorate a public instance method.')
    }
    if (registeredChartTools.has(config.name)) {
      throw new TypeError(`[Tool] '${config.name}' is already registered.`)
    }
    const registeredConfig = Object.freeze({
      ...config,
      parameters: deepFreeze(Value.Clone(config.parameters)),
    })
    registeredChartTools.set(config.name, {
      config: registeredConfig,
      async execute(target, input, execution) {
        return value.call(target as T, requireToolInput(registeredConfig.parameters, input), execution)
      },
      summarizeInput(input) {
        return summarizeToolInput(requireToolInput(registeredConfig.parameters, input))
      },
    })
  }
}

/** 返回已标注的 Core 图表能力，供宿主适配为 Agent Runtime 工具。 */
export function getRegisteredChartTools(): readonly RegisteredChartTool[] {
  return [...registeredChartTools.values()]
}
