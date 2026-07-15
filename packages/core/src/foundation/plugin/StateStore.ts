/**
 * 状态存储类
 * 用于渲染器间的状态共享
 */
import type { BaseIndicatorState } from './types'

export class StateStore {
  private states: Map<string, BaseIndicatorState> = new Map()
  private ownerNamespaces: Map<string, Set<string>> = new Map()

  /**
   * 设置状态
   * @param namespace 状态命名空间
   * @param state 状态值
   * @param ownerId 可选的拥有者 ID（用于冲突检测）
   */
  setState<T extends BaseIndicatorState>(namespace: string, state: T, ownerId?: string): void {
    this.states.set(namespace, state)
  }

  /**
   * 获取状态
   * @param namespace 状态命名空间
   */
  getState<T extends BaseIndicatorState>(namespace: string): T | undefined {
    const state = this.states.get(namespace) as T | undefined
    return state
  }

  /**
   * 清除指定命名空间的状态
   * @param namespace 状态命名空间
   */
  clearState(namespace: string): void {
    this.states.delete(namespace)
  }

  /**
   * 注册状态拥有者
   * @param ownerId 拥有者 ID（通常是渲染器名称）
   * @param namespaces 声明的命名空间列表
   */
  registerStateOwner(ownerId: string, namespaces: string[]): void {
    this.ownerNamespaces.set(ownerId, new Set(namespaces))
  }

  /**
   * 按拥有者清除所有状态
   * @param ownerId 拥有者 ID
   */
  clearByOwner(ownerId: string): void {
    const namespaces = this.ownerNamespaces.get(ownerId)
    if (namespaces) {
      namespaces.forEach((ns) => {
        this.states.delete(ns)
        if (import.meta.env.DEV) {
          console.debug(`[StateStore] Cleared state: ${ns} (owner: ${ownerId})`)
        }
      })
      this.ownerNamespaces.delete(ownerId)
    } else if (import.meta.env.DEV) {
      console.warn(`[StateStore] Attempted to clear state for unknown owner: ${ownerId}`)
    }
  }

  /**
   * 清空所有状态
   */
  clear(): void {
    this.states.clear()
    this.ownerNamespaces.clear()
  }
}
