/**
 * 轻量响应式原语，零外部依赖：原始 signal 推送通知，派生值按需求值。
 *
 * @remarks
 * 设计约束:
 *
 * 1. 非 batch 模式下 set 同步通知（无微任务调度）
 * 2. batch() 只推迟通知，不推迟派生：最外层 batch 退出时一次性提交
 * 3. 派生值写入后只标脏，读取（含 peek）时按当前输入重算，
 *    因此"写原始状态后立即读派生"在任何位置都读到当前值
 * 4. 无 Proxy / 无深度追踪 —— 仅顶层读/写
 * 5. 相等性通过 Object.is 短路；派生值未变化不通知下游
 * 6. 一次提交内每个订阅者（含 effect）只收到一次通知
 * 7. subscribe 返回取消订阅函数；可安全用于 React useSyncExternalStore、
 *    Vue effect、Angular toSignal
 * 8. effect 在其内部读取的任何 signal 重新发出值时自动重跑
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

/** 待执行任务：派生结算与订阅者通知按入队顺序执行。 */
const pending = new Set<() => void>()
let flushing = false

/** 订阅者任务（外部监听与 effect）：同一次提交内只执行一次。 */
const notificationTasks = new WeakSet<() => void>()
/** 本次提交已执行过的订阅者任务。 */
const notifiedTasks = new Set<() => void>()

/** 把任务登记为订阅者通知，允许提交内去重；派生失效任务不登记（幂等且可能再次失效）。 */
function asNotification(job: () => void): () => void {
  notificationTasks.add(job)
  return job
}

/** 入队一个任务；不在提交中时立即同步提交。 */
function enqueue(job: () => void): void {
  pending.add(job)
  if (batchDepth === 0 && !flushing) flush()
}

/**
 * 执行到队列为空。
 *
 * @remarks 派生结算过程中产生的新任务在同一轮提交内继续执行；
 * 订阅者按去重表只收到一次通知，派生失效任务则按需重复执行。
 */
function flush(): void {
  if (flushing) return
  flushing = true
  try {
    while (pending.size > 0) {
      const jobs = [...pending]
      pending.clear()
      for (const job of jobs) {
        if (notificationTasks.has(job)) {
          if (notifiedTasks.has(job)) continue
          notifiedTasks.add(job)
        }
        notify(job)
      }
    }
  } finally {
    notifiedTasks.clear()
    flushing = false
  }
}

/**
 * 通知单个订阅者，并隔离它的异常。
 *
 * 状态通知是所有消费者的公共总线：一个订阅者失败不能让其余消费者
 * 收不到已经提交的状态，否则界面会表现为"数据已到但整页停摆"。
 * 异常集中上报而不向外穿透；订阅者自身的半成品状态由订阅者负责。
 */
function notify(listener: () => void): void {
  try {
    listener()
  } catch (error) {
    console.error('[reactivity] subscriber error:', error)
  }
}

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
    // 提交中的写入开启新一轮通知：订阅者可以再次收到后续变更。
    if (flushing) notifiedTasks.clear()
    // copy to allow listener self-unsubscribe during dispatch
    const listeners = [...subscribers]
    // 先同步传播派生失效，再入队通知：订阅者不会读到尚未失效的派生值。
    for (const listener of listeners) {
      if (!notificationTasks.has(listener)) listener()
    }
    for (const listener of listeners) {
      if (notificationTasks.has(listener)) enqueue(listener)
    }
  }

  const subscribe = (listener: () => void): (() => void) => {
    const job = asNotification(listener)
    subscribers.add(job)
    return () => {
      subscribers.delete(job)
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
  // effect 是订阅者：同一次提交内重复入队只执行一次。
  asNotification(tracker.run)
  tracker.run()
  return () => {
    for (const dep of tracker.deps) dep.delete(tracker.run)
    tracker.deps.clear()
  }
}

/**
 * 创建一个按需求值的派生（只读）signal。
 *
 * @remarks
 * 上游变更只把派生值标脏，读取时（含 `peek`）按当前上游状态重算，因此不存在
 * "写入后派生值尚未提交"的时间窗；通知在提交时按最终值发出，值未变化则不通知。
 * 返回的 ReadonlySignal 没有 .set() 方法，调用方无法写回，以此强制单向数据流。
 *
 * @param fn - 派生函数，必须是纯函数，会按依赖变化重算
 * @returns 只读的派生 signal
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  let value = undefined as unknown as T
  let initialized = false
  /** 上游已变更，下次读取必须重算。 */
  let dirty = true
  /** 重算进行中：派生函数直接或间接读回自身即为循环依赖。 */
  let evaluating = false
  /** 自上次提交以来值是否变化，提交时据此决定是否通知下游。 */
  let changed = false
  let settleScheduled = false
  const subscribers = new Set<() => void>()
  /** 上游订阅集合；每次重算整体重建，条件依赖不会残留。 */
  const deps = new Set<Set<() => void>>()

  /** 上游写入：同步把失效传播到整条派生链，并排队提交；不立即重算、不通知订阅者。 */
  const invalidate = (): void => {
    if (dirty) return
    dirty = true
    // 下游派生必须现在就失效，否则 batch 内读取链路会拿到旧值；订阅者通知留到提交。
    for (const subscriber of [...subscribers]) {
      if (!notificationTasks.has(subscriber)) subscriber()
    }
    if (settleScheduled) return
    settleScheduled = true
    enqueue(settle)
  }

  /** 读取当前派生值；脏则按当前上游状态重算。 */
  const materialize = (): T => {
    if (!dirty) return value
    if (evaluating) throw new Error('[reactivity] computed 在读回自身，存在循环依赖')
    evaluating = true
    try {
      for (const dependency of deps) dependency.delete(invalidate)
      deps.clear()
      const previousTracker = activeTracker
      activeTracker = { deps, run: invalidate }
      let next: T
      try {
        next = fn()
      } finally {
        activeTracker = previousTracker
      }
      if (!initialized) {
        initialized = true
      } else if (!Object.is(value, next)) {
        changed = true
      }
      value = next
      dirty = false
      return value
    } finally {
      evaluating = false
    }
  }

  /** 提交：按最终值决定是否通知下游；提交内的读取已重算的值不会重复通知。 */
  const settle = (): void => {
    settleScheduled = false
    materialize()
    if (!changed) return
    changed = false
    for (const subscriber of [...subscribers]) enqueue(subscriber)
  }

  const read = (): T => {
    if (activeTracker !== null) {
      subscribers.add(activeTracker.run)
      activeTracker.deps.add(subscribers)
    }
    return materialize()
  }

  const peek = (): T => materialize()

  const subscribe = (listener: () => void): (() => void) => {
    const job = asNotification(listener)
    subscribers.add(job)
    return () => {
      subscribers.delete(job)
    }
  }

  // 首次求值与既有行为一致：创建即得到当前值，之后按需重算。
  materialize()
  return Object.assign(read, { peek, subscribe }) as ReadonlySignal<T>
}

/**
 * 将多个 signal 写入合并为一次通知周期。
 *
 * @remarks
 * 在 batch(fn) 内部，所有 signal.set() 只入队通知而非立即通知；派生值按需重算，
 * 因此在 batch 内读取派生状态同样得到当前输入推导出的值，不存在陈旧快照。
 * 最外层 batch 退出时提交：派生按最终值通知下游，每个订阅者恰好触发一次（已去重）。
 * 支持嵌套 —— 仅最外层 batch 触发提交。
 *
 * @example
 * batch(() => {
 *   signalA.set(1)
 *   // 派生的当前值已经是 1 的推导结果
 *   derived.peek()
 * })
 * // 订阅者在提交后各收到一次通知
 *
 * @param fn - 批量写入函数
 * @returns fn 的返回值
 */
export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) flush()
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
