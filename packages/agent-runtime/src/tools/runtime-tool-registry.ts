// 本文件提供宿主注册与解析 Agent Runtime 工具的统一入口。
import type { RuntimeToolDefinition } from '../pi/types.js'

/** 可在工具面板展示的稳定工具元数据。 */
export interface RuntimeToolMetadata {
  readonly name: string
  readonly label: string
  readonly description: string
}

/** 工具在当前宿主上下文中是否允许启用的结果。 */
export interface RuntimeToolAvailability {
  readonly available: boolean
  readonly unavailableReason?: string
}

/** 由宿主上下文创建当前可执行工具的工厂。 */
export interface RuntimeToolFactory<TContext> extends RuntimeToolMetadata {
  /** 返回不可启用原因；未返回原因表示当前可启用。 */
  check?(context: TContext): string | undefined
  /** 根据当前宿主状态返回工具；当前不可用时返回 undefined。 */
  create(context: TContext): RuntimeToolDefinition | undefined
}

/** 管理一个宿主内的 Agent Runtime 工具注册与解析。 */
export class RuntimeToolCatalog<TContext> {
  private readonly registrations = new Map<string, RuntimeToolFactory<TContext>>()

  /** 注册一个工具；名称重复代表宿主配置错误。 */
  register(registration: RuntimeToolFactory<TContext>): void {
    if (this.registrations.has(registration.name)) {
      throw new TypeError(`Runtime tool '${registration.name}' is already registered.`)
    }
    this.registrations.set(registration.name, registration)
  }

  /** 返回指定工具在当前宿主上下文中的可启用状态。 */
  check(name: string, context: TContext): RuntimeToolAvailability | undefined {
    const factory = this.registrations.get(name)
    if (!factory) return undefined
    const unavailableReason = factory.check?.(context)
    return unavailableReason ? { available: false, unavailableReason } : { available: true }
  }

  /** 返回全部已注册工具及其当前可启用状态。 */
  list(context: TContext): readonly (RuntimeToolMetadata & RuntimeToolAvailability)[] {
    return [...this.registrations.values()].map(({ name, label, description }) => {
      const availability = this.check(name, context)!
      return { name, label, description, ...availability }
    })
  }

  /** 根据当前宿主状态解析本次可执行的工具。 */
  resolve(context: TContext): readonly RuntimeToolDefinition[] {
    const tools: RuntimeToolDefinition[] = []
    for (const registration of this.registrations.values()) {
      if (!this.check(registration.name, context)?.available) continue
      const tool = registration.create(context)
      if (tool) tools.push(tool)
    }
    return tools
  }
}
