/**
 * 状态存储类
 * 用于渲染器间的状态共享
 */
import type { BaseIndicatorState } from '../types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'

export class StateStore {
  private readonly states = new Map<string, BaseIndicatorState>()
  private readonly owners = new Map<string, string>()

  private requireOwnership(namespace: string, ownerId?: string): void {
    const owner = this.owners.get(namespace)
    if (owner !== undefined && owner !== ownerId) {
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, `State namespace "${namespace}" is owned by "${owner}"`)
    }
  }

  /**
   * 设置状态
   * @param namespace 状态命名空间
   * @param state 状态值
   * @param ownerId 可选的拥有者 ID（用于冲突检测）
   */
  setState<T extends BaseIndicatorState>(namespace: string, state: T, ownerId?: string): void {
    this.requireOwnership(namespace, ownerId)
    if (ownerId !== undefined) this.owners.set(namespace, ownerId)
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
    for (const namespace of namespaces) this.requireOwnership(namespace, ownerId)
    for (const namespace of namespaces) this.owners.set(namespace, ownerId)
  }

  /**
   * 按拥有者清除所有状态
   * @param ownerId 拥有者 ID
   */
  clearByOwner(ownerId: string): void {
    for (const [namespace, owner] of this.owners) {
      if (owner !== ownerId) continue
      this.states.delete(namespace)
      this.owners.delete(namespace)
    }
  }

  /**
   * 清空所有状态
   */
  clear(): void {
    this.states.clear()
    this.owners.clear()
  }
}
