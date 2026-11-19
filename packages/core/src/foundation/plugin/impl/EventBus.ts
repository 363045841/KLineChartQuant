/**
 * 事件总线实现
 */
import type { EventHandler } from '../types.js'

type EventMap = Map<string, Set<EventHandler>>

export class EventBus {
  private readonly listeners: EventMap = new Map()

  constructor(private readonly reportError: (message: string, error: unknown) => void = console.error) {}

  /**
   * 订阅事件
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as EventHandler)
  }

  /**
   * 取消订阅
   */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as EventHandler)
      if (!handlers.size) this.listeners.delete(event)
    }
  }

  /**
   * 发布事件
   */
  emit<T = unknown>(event: string, data: T): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    const report = (error: unknown) => this.reportError(`[EventBus] Error in handler for "${event}":`, error)
    for (const handler of [...handlers]) {
      try {
        const result = handler(data)
        if (result !== undefined) void Promise.resolve(result).catch(report)
      } catch (error) {
        report(error)
      }
    }
  }

  /**
   * 订阅一次性事件
   *
   * 注册一个仅在事件首次触发时执行的回调。回调执行后会自动从监听队列中移除，
   * 确保后续相同事件的 emit 不会再触发该逻辑。
   *
   * @param event - 事件名称
   * @param handler - 待执行的回调函数
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler<T> = (data) => {
      this.off(event, wrapper)
      return handler(data)
    }
    this.on(event, wrapper)
  }

  /**
   * 清除所有事件监听
   */
  clear(): void {
    this.listeners.clear()
  }

  /**
   * 获取事件的监听器数量
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0
  }
}
