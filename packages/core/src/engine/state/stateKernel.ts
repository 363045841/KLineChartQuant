/**
 * StateKernel —— 图表集中式状态的 composition root（组合根）。
 *
 * @remarks
 * 设计契约（由 TypeScript 结构类型系统强制保证）：
 *
 * 1. SSOT（单一可信源）—— 每一段状态有且仅有一个 writable signal。
 *    不存在第二份缓存、shadow field（影子字段）或手动同步路径。
 *
 * 2. Computed 推导 —— 派生值存放于 computed() 中。
 *    源 signal 变化后 computed 自动重求值。
 *    禁止手写 syncXxx() 或 updateYyy() 等方法。
 *
 * 3. 读写边界 —— 外部消费者收到的是 ReadonlySignal（无 .set() 方法）。
 *    内部变更必须通过仅在 Action 方法内可访问的 WritableSignal。
 *    TypeScript 编译器会阻止从渲染或 UI 上下文中调用 .set()。
 *
 * 4. 仅 Action 变更 —— 所有状态变更流经语义化的 Action 方法
 *    （scrollTo、zoomTo 等）。Actions 可在单一位置进行 batch（批处理）、
 *    校验或触发 side-effect（副作用）。
 *
 * 子状态模块通过 createSubState() 构建并在此组合。
 * Kernel 本身不含任何业务逻辑 —— 仅负责 wiring（编排连接）
 * 子状态并暴露其 readonly 视图和 actions。
 */

import type { ReadonlySignal } from '../../foundation/reactivity/signal'

/**
 * 每个子状态模块需提供的基本形状（shape）。
 *
 * @typeParam R - readonly signal 的集合
 * @typeParam A - action 方法的记录类型
 *
 * @remarks
 * readonly 为公开的只读 signal 视图；
 * actions 为语义化的变更方法（内部调用 .set()）。
 * 子状态工厂返回该接口，kernel 负责组合它们。
 */
export interface SubStateModule<
  R extends Record<string, ReadonlySignal<unknown>>,
  A extends Record<string, (...args: any[]) => void>,
> {
  readonly: R
  actions: A
}

/**
 * StateKernel 持有子状态模块的引用，并将其 readonly signal + actions
 * 暴露在单一的 bag（集合）中。
 *
 * @remarks
 * 具体 kernel（如 ChartStateKernel）声明其组合了哪些子状态。
 * 基类不提供任何运行时行为 —— 它仅用于记录组合模式，
 * 并为消费者提供一个稳定的 import 入口点。
 * 子类在其 constructor 中 wiring（编排连接）具体的子状态。
 */
export abstract class StateKernel {
  /**
   * 所有子状态的 readonly signals，合并为一个 bag。
   *
   * @remarks Framework adapter（Vue / React / Angular）直接消费此集合。
   */
  abstract readonly signals: Record<string, ReadonlySignal<unknown>>

  /**
   * 所有子状态的 action 方法，合并为一个 bag。
   *
   * @remarks 这些是唯一被许可的状态变更路径。
   */
  abstract readonly actions: Record<string, (...args: any[]) => void>

  /**
   * 清理钩子，释放所有子状态的 effect（副作用）和 subscription（订阅）。
   *
   * @remarks 在图表销毁时调用。
   */
  abstract dispose(): void
}
