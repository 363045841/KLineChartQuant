/**
 * 轻量 push-based 响应式原语，零外部依赖。
 *
 * @remarks
 * 设计约束:
 *
 * 1. 非 batch 模式下 set 同步通知（无微任务调度）
 * 2. batch() 将所有通知推迟到最外层 batch 退出时
 * 3. 无 Proxy / 无深度追踪 —— 仅顶层读/写
 * 4. 相等性通过 Object.is 短路
 * 5. subscribe 返回取消订阅函数；可安全用于 React useSyncExternalStore、
 *    Vue effect、Angular toSignal
 * 6. effect 在其内部读取的任何 signal 重新发出值时自动重跑
 */

/**
 * 只读 signal —— 所有派生状态的公开面。
 *
 * @remarks
 * 消费者（renderers、UI bindings、framework adapters）收到的是
 * ReadonlySignal，可以读取/订阅但不能写入。
 * TypeScript 编译器阻止在该类型上调用 .set()，以此强制 StateKernel
 * 的不变性：状态变更只能通过 Actions 流转。
 *
 * WritableSignal 通过 set() 扩展此形状，因此接受 ReadonlySignal
 * 的函数也可以传入 writable signal，但反过来被结构类型系统禁止。
 */
export type ReadonlySignal<T> = {
  /**
   * 读取当前值；在 effect 内部调用时会被追踪
   */
  (): T
  /**
   * 读取当前值，不触发追踪
   */
  peek: () => T
  /**
   * 订阅变更通知；返回取消订阅函数
   */
  subscribe: (listener: () => void) => () => void
}

/**
 * 可写 signal —— 仅限 StateKernel 子状态内部使用。
 *
 * @remarks
 * .set() 方法是唯一的变更入口。将字段声明为 private 并对外暴露
 * ReadonlySignal，即可在生产方（Actions）与消费方（renderers/UI）
 * 之间建立编译时边界。
 */
export type WritableSignal<T> = ReadonlySignal<T> & {
  /**
   * 写入新值；当与当前值 Object.is 不等时通知订阅者
   */
  set: (next: T) => void
}

/**
 * 为向后兼容保留的别名。
 *
 * @remarks Signal 等价于 WritableSignal，即 createSignal 返回的完整读/写形状。
 * 已有的 import 继续可用。
 */
export type Signal<T> = WritableSignal<T>

/**
 * 为向后兼容保留的别名。
 *
 * @remarks Computed 等价于 ReadonlySignal，即 computed() 返回的只读形状。
 */
export type Computed<T> = ReadonlySignal<T>

/**
 * 可写 ref：kernel 内部对一段状态的句柄。
 *
 * @remarks 与 WritableSignal 完全等同；命名上镜像 Vue 的 shallowRef / writableRef
 * 惯例，使子状态定义中的迁移读起来更自然。
 */
export type WritableRef<T> = WritableSignal<T>

/**
 * writable ref 的只读面 —— 对外暴露给消费者的类型。
 *
 * @remarks 形状与 ReadonlySignal 相同。
 */
export type ReadonlyRef<T> = ReadonlySignal<T>

type Tracker = {
  deps: Set<Set<() => void>>
  run: () => void
}

let activeTracker: Tracker | null = null

let batchDepth = 0
const pendingBatch = new Set<() => void>()

/**
 * 创建一个 writable signal（别名：writableRef）。
 *
 * @param initial - 初始值
 * @returns WritableSignal，内部可变更，外部可通过赋值或返回类型注解降级为 ReadonlySignal
 */
export function createSignal<T>(initial: T): WritableSignal<T> {
  let value = initial
  const subscribers = new Set<() => void>()

  const read = (): T => {
    if (activeTracker !== null) {
      subscribers.add(activeTracker.run)
      activeTracker.deps.add(subscribers)
    }
    return value
  }

  const peek = (): T => value

  const set = (next: T): void => {
    if (Object.is(value, next)) return
    value = next
    if (batchDepth > 0) {
      for (const listener of subscribers) pendingBatch.add(listener)
    } else {
      // copy to allow listener self-unsubscribe during notify
      for (const listener of [...subscribers]) listener()
    }
  }

  const subscribe = (listener: () => void): (() => void) => {
    subscribers.add(listener)
    return () => {
      subscribers.delete(listener)
    }
  }

  return Object.assign(read, { peek, set, subscribe }) as WritableSignal<T>
}

/**
 * createSignal 的别名，镜像 Vue 的 writableRef 惯例。
 *
 * @remarks 在 kernel 子状态定义中使用，如 signals.scrollLeft = writableRef(0)。
 */
export const writableRef = createSignal

/**
 * 创建一个自动追踪依赖的 effect。
 *
 * @param fn - 副作用函数，其中读取的 signal 被自动追踪
 * @returns 清理函数，调用后取消 effect 及其所有订阅
 */
export function effect(fn: () => void): () => void {
  const tracker: Tracker = {
    deps: new Set(),
    run: () => {
      // tear down previous subscriptions before re-tracking
      for (const dep of tracker.deps) dep.delete(tracker.run)
      tracker.deps.clear()
      const prev = activeTracker
      activeTracker = tracker
      try {
        fn()
      } finally {
        activeTracker = prev
      }
    },
  }
  tracker.run()
  return () => {
    for (const dep of tracker.deps) dep.delete(tracker.run)
    tracker.deps.clear()
  }
}

/**
 * 创建一个派生（只读）signal。
 *
 * @remarks
 * computed(fn) 立即执行 fn 一次，之后每当 fn 中读取的 signal 变更时自动重跑。
 * 返回的 ReadonlySignal 没有 .set() 方法，调用方无法写回，以此强制单向数据流：
 * source signals 到 computed 到 consumers。
 *
 * @param fn - 派生函数
 * @returns 只读的派生 signal
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const inner = createSignal<T>(undefined as unknown as T)
  let initialized = false
  effect(() => {
    const next = fn()
    if (!initialized) {
      initialized = true
      // bypass equality check on first run
      ;(inner as unknown as { set: (v: T) => void }).set(next)
      return
    }
    inner.set(next)
  })
  const read = (): T => inner()
  return Object.assign(read, { peek: inner.peek, subscribe: inner.subscribe }) as ReadonlySignal<T>
}

/**
 * 将多个 signal 写入合并为一次通知周期。
 *
 * @remarks
 * 在 batch(fn) 内部，所有 signal.set() 调用将订阅者入队而非立即通知。
 * 最外层 batch 退出时，每个累积的订阅者恰好触发一次（已去重）。
 * 支持嵌套 —— 仅最外层 batch 触发 flush。
 *
 * @example
 * batch(() => {
 *   signalA.set(1)
 *   signalB.set('x')
 *   // subscribers haven't fired yet
 * })
 * // all subscribers fire once, deduped
 *
 * @param fn - 批量写入函数
 * @returns fn 的返回值
 */
export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    if (batchDepth === 1) {
      // computed 可能在本轮执行中继续产生下游 listener，必须持续清空队列才能发布完整快照。
      while (pendingBatch.size > 0) {
        const toNotify = [...pendingBatch]
        pendingBatch.clear()
        for (const listener of toNotify) listener()
      }
    }
    batchDepth--
  }
}

/**
 * selectSignal 返回值：只读投影 + 解除对 source 的订阅。
 */
export type SelectedSignal<U> = ReadonlySignal<U> & {
  /** 取消对 source 的订阅；之后不再随 source 更新 */
  dispose: () => void
}

/**
 * 从源 Signal 投影只读 Signal。
 * 仅当 selector 结果相对上一值 equal 判定为不等时通知。
 *
 * @remarks
 * 用于框架桥接：避免整包 snapshot 变化时无关字段也触发 UI 更新。
 * 默认 equal 为 Object.is；对 {x,y} 等可传入结构相等函数。
 * 短生命周期投影必须调用 dispose，否则会永久订阅 source。
 *
 * @typeParam T - 源快照类型
 * @typeParam U - 投影结果类型
 */
export function selectSignal<T, U>(
  source: ReadonlySignal<T>,
  selector: (value: T) => U,
  equal: (a: U, b: U) => boolean = Object.is,
): SelectedSignal<U> {
  const selected = createSignal(selector(source.peek()))
  const unsubSource = source.subscribe(() => {
    const next = selector(source.peek())
    if (equal(selected.peek(), next)) return
    selected.set(next)
  })
  const read = (): U => selected()
  return Object.assign(read, {
    peek: selected.peek,
    subscribe: selected.subscribe,
    dispose: unsubSource,
  }) as SelectedSignal<U>
}

/**
 * 从初始状态对象创建一组相关 signal。
 *
 * @typeParam T - 状态对象的形状
 * @param initial - 初始状态
 * @returns 包含 signals、set、snapshot 的结构，消除大量 signal 类中
 * 重复的 private xxxSignal + get xxx() 样板代码。
 *
 * @remarks
 * 使用示例：
 *
 * const state = createStateStore({ count: 0, name: '' })
 * // 读: state.signals.count()
 * // 写: state.signals.count.set(5)
 * // 批量: state.set.count(5); state.set.name('foo')
 * // 快照: state.snapshot() // { count: 5, name: 'foo' }
 */
export function createStateStore<T extends Record<string, unknown>>(initial: T) {
  const signals = {} as { [K in keyof T]: WritableSignal<T[K]> }
  const set = {} as { [K in keyof T]: (v: T[K]) => void }
  for (const key of Object.keys(initial) as (keyof T)[]) {
    const sig = createSignal<T[typeof key]>(initial[key])
    signals[key] = sig
    set[key] = (v: T[typeof key]) => sig.set(v)
  }
  return {
    signals,
    set,
    snapshot: () => {
      const s: Record<string, unknown> = {}
      for (const k of Object.keys(initial) as (keyof T)[]) s[k as string] = signals[k].peek()
      return s as T
    },
  }
}

/**
 * ReadonlySignal 包装器 —— 抹除 .set 方法。
 *
 * @remarks 对 createSignal 返回值调用 Object.assign 始终保留了 .set 引用
 * （即使类型系统已将其遮蔽），运行时通过 `in` 操作符或 `.set` 访问仍然可见。
 * 此函数显式构造一个不包含 .set 的新对象，保证运行时与类型签名保持一致。
 */
function asReadonlySignal<T>(sig: WritableSignal<T>): ReadonlySignal<T> {
  const read = (() => sig()) as ReadonlySignal<T>
  return Object.assign(read, {
    peek: sig.peek,
    subscribe: sig.subscribe,
  })
}

/**
 * StateKernel 子状态工厂。
 *
 * @typeParam T - 可写状态字段的类型
 * @typeParam C - 派生计算字段的类型
 * @param initial - 初始状态值
 * @param computedFns - 可选的派生计算函数表，每个函数接收源信号的只读视图
 * @returns 包含 signals（可写句柄）、readonly（只读视图）、snapshot（快照）的结构
 *
 * @remarks
 * 从 initial 创建一组 writable signals，然后暴露:
 *  - signals   — 私有可写句柄（有 .set()）
 *  - readonly  — 同一组 signal，类型提升为 ReadonlySignal（无 .set()）
 *  - computed  — 通过 computedFns 选项注册的派生 signal
 *
 * 子状态模块调用此工厂，私有保存 signals，向 kernel 返回 readonly + actions。
 * WritableSignal 与 ReadonlySignal 之间的 TypeScript 边界阻止外部消费者写入，
 * 同时保持内部变更的便利性。
 *
 * @example
 * function createViewportState() {
 *   const { signals, readonly } = createSubState(
 *     { scrollLeft: 0, viewWidth: 0 },
 *     {
 *       scrollLeftLogical: (s) => s.scrollLeft() - s.viewWidth(),
 *     },
 *   )
 *   return {
 *     readonly,
 *     actions: {
 *       scrollTo: (v: number) => signals.scrollLeft.set(Math.max(0, v)),
 *     },
 *   }
 * }
 */
export function createSubState<
  T extends Record<string, unknown>,
  C extends Record<string, unknown>,
>(
  initial: T,
  computedFns?: {
    [K in keyof C]: (state: { [K2 in keyof T]: ReadonlySignal<T[K2]> }) => C[K]
  },
) {
  const signals = {} as { [K in keyof T]: WritableSignal<T[K]> }
  const readonly = {} as { [K in keyof T]: ReadonlySignal<T[K]> }
  for (const key of Object.keys(initial) as (keyof T)[]) {
    const sig = createSignal<T[typeof key]>(initial[key])
    signals[key] = sig
    readonly[key] = asReadonlySignal(sig)
  }

  const computedReadonly = {} as Record<string, ReadonlySignal<unknown>>
  if (computedFns) {
    for (const key of Object.keys(computedFns) as string[]) {
      const fn = (computedFns as Record<string, (state: typeof readonly) => unknown>)[key]!
      computedReadonly[key] = computed(() => fn(readonly))
    }
  }

  return {
    /** 私有可写句柄 —— 仅传递给 actions */
    signals,
    /** 只读视图 —— 可安全暴露给外部消费者 */
    readonly: { ...readonly, ...computedReadonly } as {
      [K in keyof T]: ReadonlySignal<T[K]>
    } & { [K in keyof C]: ReadonlySignal<C[K]> },
    /** 只读快照（peek 所有 source signals） */
    snapshot: () => {
      const s: Record<string, unknown> = {}
      for (const k of Object.keys(initial) as (keyof T)[]) s[k as string] = signals[k].peek()
      return s as T
    },
  }
}
