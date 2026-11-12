/**
 * 控制器工厂的销毁守卫：dispose 之后，被 guard 包裹的变更方法变为静默 no-op。
 *
 * 适配层可能持有控制器引用并在销毁后继续调用；把这段生命周期收敛到一处，
 * 避免每个工厂各自维护一份 disposed 判断。
 */

/** 销毁守卫：控制器工厂统一使用。 */
export interface DisposeGuard {
  /** 标记控制器已销毁；重复调用无副作用。 */
  dispose(): void
  /** 包裹变更方法；销毁后调用返回 undefined，不再写状态。 */
  guard<T extends (...args: never[]) => unknown>(fn: T): T
}

/**
 * 创建销毁守卫。
 *
 * @returns 幂等的 dispose 与变更方法包装器
 */
export function createDisposeGuard(): DisposeGuard {
  let disposed = false
  return {
    dispose() {
      disposed = true
    },
    guard<T extends (...args: never[]) => unknown>(fn: T): T {
      const guarded = (...args: Parameters<T>): ReturnType<T> | undefined =>
        disposed ? undefined : (fn(...args) as ReturnType<T>)
      // 包装后的返回值在销毁后缺省，对外仍暴露原始签名（销毁后调用方不应使用返回值）。
      return guarded as T
    },
  }
}
