// 本文件提供 Agent 工具的静态注册、运行期实例化与只读过滤基础设施。
import { AgentRuntimeError } from '../contracts/errors.js'

import type { ToolProgressView, ToolSafety } from '../contracts/ui.js'
import type { RuntimeToolDefinition, RuntimeToolResult } from '../pi/types.js'
import type { Static, TSchema } from 'typebox'
import { Value } from 'typebox/value'

/** `@Tool` 可声明的安全等级；可撤销写入在具备统一撤销模型后再引入。 */
export type ToolRegistrationSafety = Extract<ToolSafety, 'read-only' | 'destructive'>

/** `@Tool` 的静态声明参数，不包含宿主依赖或运行期状态。 */
export interface ToolConfig<TParameters extends TSchema = TSchema> {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: TParameters
  readonly safety: ToolRegistrationSafety
  readonly executionMode?: 'parallel' | 'sequential'
}

/** 工具执行时由运行时提供的控制信息。 */
export interface ToolExecutionContext {
  readonly runId: string
  readonly toolCallId: string
  readonly signal: AbortSignal
  progress(update: ToolProgressView): void
}

/** 被注册工具的运行期实现契约。 */
export interface ToolImplementation<TParameters extends TSchema = TSchema> {
  execute(input: Static<TParameters>, context: ToolExecutionContext): Promise<RuntimeToolResult>
  summarizeInput?(input: Static<TParameters>): string
}

/** 使用类装饰器注册的工具类型；构造参数由宿主 composition root 负责注入。 */
export type ToolDefinitionClass = new (...args: any[]) => ToolImplementation

/** 注册表中保存的静态声明与对应工具类型。 */
export interface RegisteredTool<TParameters extends TSchema = TSchema> {
  readonly config: ToolConfig<TParameters>
  readonly type: ToolDefinitionClass
}

/** 宿主在每轮 Run 中创建已注册工具的实现实例。 */
export type ToolImplementationFactory = (tool: RegisteredTool) => ToolImplementation

const registeredTools = new Map<string, RegisteredTool>()
const TOOL_INPUT_ERROR_LIMIT = 5
const TOOL_INPUT_SUMMARY_MAX_LENGTH = 200

/** 递归冻结注册表拥有的 schema 副本，防止嵌套字段在运行期被篡改。 */
function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || visited.has(value)) return value

  visited.add(value)
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key), visited)
  }
  return Object.freeze(value)
}

/** 复制并冻结工具元数据，使全局注册表不与调用方共享可变对象。 */
function createRegisteredToolConfig<TParameters extends TSchema>(
  config: ToolConfig<TParameters>,
): ToolConfig<TParameters> {
  const registeredConfig = {
    ...config,
    parameters: deepFreeze(Value.Clone(config.parameters)),
  }
  return Object.freeze(registeredConfig)
}

/** 验证工具名称，避免 Provider 侧出现无法定位的工具定义。 */
function validateToolConfig(config: ToolConfig): void {
  if (!config.name.trim()) {
    throw new AgentRuntimeError('INVALID_PAYLOAD', '[Tool] name must not be empty.')
  }
  if (!config.label.trim()) {
    throw new AgentRuntimeError('INVALID_PAYLOAD', `[Tool] '${config.name}' label must not be empty.`)
  }
  if (!config.description.trim()) {
    throw new AgentRuntimeError(
      'INVALID_PAYLOAD',
      `[Tool] '${config.name}' description must not be empty.`,
    )
  }
}

/**
 * 标准类装饰器：在模块加载时收集工具静态定义。
 * 运行期依赖必须通过 ToolImplementationFactory 注入，不能写入 config。
 */
export function Tool<TParameters extends TSchema>(config: ToolConfig<TParameters>) {
  return function <T extends ToolDefinitionClass>(
    value: T,
    context: ClassDecoratorContext<T>,
  ): T {
    context.addInitializer(function (this: T) {
      validateToolConfig(config)
      if (registeredTools.has(config.name)) {
        throw new AgentRuntimeError(
          'TOOL_NAME_CONFLICT',
          `[Tool] '${config.name}' is already registered.`,
        )
      }

      // 注册表持有独立的不可变副本，外部代码不能污染已发布的工具契约。
      registeredTools.set(config.name, {
        config: createRegisteredToolConfig(config),
        type: this,
      })
    })
    return value
  }
}

/** 返回当前全部已注册工具的静态定义。 */
export function getRegisteredTools(): readonly RegisteredTool[] {
  return [...registeredTools.values()]
}

/** 根据安全等级筛选可暴露给本轮 Run 的工具。 */
export function filterRuntimeTools(
  tools: readonly RuntimeToolDefinition[],
  readOnly: boolean,
): readonly RuntimeToolDefinition[] {
  return readOnly ? tools.filter((tool) => tool.safety === 'read-only') : tools
}

/** 将 TypeBox 的运行时校验显式声明为 TypeScript 类型守卫。 */
function isToolInput<TParameters extends TSchema>(
  schema: TParameters,
  input: unknown,
): input is Static<TParameters> {
  return Value.Check(schema, input)
}

/** 汇总有限条 Schema 失败路径，供模型修正参数而不回显原始输入值。 */
function describeToolInputErrors<TParameters extends TSchema>(
  schema: TParameters,
  input: unknown,
): string {
  const details: string[] = []
  for (const error of Value.Errors(schema, input)) {
    details.push(`${error.instancePath || '/'}: ${error.message}`)
    if (details.length === TOOL_INPUT_ERROR_LIMIT) break
  }
  return details.join('; ') || 'Schema validation failed.'
}

/** 使用工具声明的 TypeBox Schema 将 Provider 原始输入收窄为实现所需的类型。 */
function requireToolInput<TParameters extends TSchema>(
  schema: TParameters,
  input: unknown,
): Static<TParameters> {
  if (!isToolInput(schema, input)) {
    throw new AgentRuntimeError(
      'INVALID_PAYLOAD',
      `The tool input is invalid: ${describeToolInputErrors(schema, input)}`,
    )
  }
  return input
}

/** 将已校验的工具参数序列化为有限长度快照，供 UI 审计工具调用。 */
function summarizeToolInput(input: unknown): string {
  let serialized: string
  try {
    serialized = JSON.stringify(input) ?? 'undefined'
  } catch {
    return '[Unserializable tool input]'
  }
  if (serialized.length <= TOOL_INPUT_SUMMARY_MAX_LENGTH) return serialized
  return `${serialized.slice(0, TOOL_INPUT_SUMMARY_MAX_LENGTH - 3)}...`
}

/** 将一份带泛型参数的注册元数据适配为 Pi 所需的擦除类型定义。 */
function createRuntimeToolDefinition<TParameters extends TSchema>(
  config: ToolConfig<TParameters>,
  createImplementation: () => ToolImplementation<TParameters>,
): RuntimeToolDefinition {
  let implementation: ToolImplementation<TParameters> | undefined

  /** 仅在模型实际调用工具时创建宿主实现，避免未使用工具占用本轮 Run 资源。 */
  function getImplementation(): ToolImplementation<TParameters> {
    implementation ??= createImplementation()
    return implementation
  }

  return {
    ...config,
    // 当前注册基础设施只支持只读和 destructive；两者均不提供统一撤销能力。
    reversible: false,
    summarizeInput: (input) => {
      const validatedInput = requireToolInput(config.parameters, input)
      return getImplementation().summarizeInput?.(validatedInput) ?? summarizeToolInput(validatedInput)
    },
    execute: (input, context) =>
      getImplementation().execute(requireToolInput(config.parameters, input), context),
  }
}

/**
 * 将静态注册表与本轮工具实例组合为 Pi 运行计划可使用的定义。
 * @param readOnly 是否仅允许只读工具。
 * @param createImplementation 宿主的运行期依赖注入入口。
 */
export function createRegisteredRuntimeTools(
  readOnly: boolean,
  createImplementation: ToolImplementationFactory,
): readonly RuntimeToolDefinition[] {
  const definitions = getRegisteredTools().map((tool) =>
    createRuntimeToolDefinition(tool.config, () => createImplementation(tool)),
  )
  return filterRuntimeTools(definitions, readOnly)
}

/** 清空全局注册表，仅供彼此隔离的单元测试使用。 */
export function clearRegisteredToolsForTest(): void {
  registeredTools.clear()
}
