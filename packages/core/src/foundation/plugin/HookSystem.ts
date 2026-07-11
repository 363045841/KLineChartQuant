/**
 * Hook 钩子系统实现
 */
import type { HookCallOptions, HookDescriptor, HookFn } from './types'

export class HookSystem {
  private hooks: Map<string, HookDescriptor[]> = new Map()

  /**
   * 注册钩子
   */
  tap<T = unknown, R = unknown>(hookName: string, fn: HookFn<T, R>, priority = 0): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, [])
    }

    const descriptors = this.hooks.get(hookName)!
    descriptors.push({ name: hookName, fn: fn as HookFn, priority })

    // 按优先级排序（数字小的先执行）
    descriptors.sort((a, b) => a.priority - b.priority)
  }

  /**
   * 移除钩子
   */
  untap(hookName: string, fn: HookFn): void {
    const descriptors = this.hooks.get(hookName)
    if (descriptors) {
      const index = descriptors.findIndex((d) => d.fn === fn)
      if (index !== -1) {
        descriptors.splice(index, 1)
      }
    }
  }

  /**
   * 触发钩子（异步）
   */
  async call<T = unknown, R = unknown>(
    hookName: string,
    context: T,
    options?: HookCallOptions,
  ): Promise<R[]> {
    const descriptors = this.hooks.get(hookName)
    if (!descriptors || descriptors.length === 0) {
      return []
    }

    const results: R[] = []
    for (const { fn } of descriptors) {
      try {
        const result = await fn(context)
        results.push(result as R)
      } catch (error) {
        console.error(`[HookSystem] Error in hook "${hookName}":`, error)
        if (options?.throwOnError) {
          throw error
        }
      }
    }
    return results
  }

  /**
   * 触发钩子（同步）
   */
  callSync<T = unknown, R = unknown>(hookName: string, context: T, options?: HookCallOptions): R[] {
    const descriptors = this.hooks.get(hookName)
    if (!descriptors || descriptors.length === 0) {
      return []
    }

    const results: R[] = []
    for (const { fn } of descriptors) {
      try {
        const result = fn(context) as R
        results.push(result)
      } catch (error) {
        console.error(`[HookSystem] Error in hook "${hookName}":`, error)
        if (options?.throwOnError) {
          throw error
        }
      }
    }
    return results
  }

  /**
   * 清除所有钩子
   */
  clear(): void {
    this.hooks.clear()
  }

  /**
   * 获取钩子数量
   */
  hookCount(hookName: string): number {
    return this.hooks.get(hookName)?.length ?? 0
  }
}
