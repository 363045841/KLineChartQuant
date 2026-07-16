/**
 * 帧事务：高频输入集中写入，每帧最多发布一次不可变快照。
 *
 * @remarks
 * 解决两类问题：
 * 1. pointermove 等事件若直接写普通 Signal，会按事件频率广播订阅者。
 * 2. latest 与 published 双视图会让不同模块读到不同代际状态。
 *
 * 本原语只暴露 pending 写入与 published 快照，不暴露公开 latest。
 * 一帧固定走 capture → derive → seal → render → publish → complete。
 * render 或 publish 期间的 writeInput 一律进入下一代 pending。
 */

import { createSignal, type ReadonlySignal } from './signal'

/** 帧事务所处阶段；用于隔离重入写入 */
export type FramePhase = 'idle' | 'capturing' | 'deriving' | 'sealing' | 'rendering' | 'publishing'

/**
 * 浅合并输入补丁。
 * 仅顶层键覆盖，不递归合并嵌套对象。
 */
function mergeInput<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch }
}

export interface FrameTransactionOptions<TInput extends Record<string, unknown>, TSnapshot> {
  /** 初始 pending 输入；也会用于生成 generation 0 的占位 published */
  initialInput: TInput
  /**
   * 由封存输入纯推导快照。
   * 不得写外部 kernel / DOM；失败则本帧不发布。
   */
  derive: (input: Readonly<TInput>, generation: number) => TSnapshot
  /**
   * 可选：使用本帧快照绘制或执行副作用。
   * 此阶段 writeInput 进入下一代，不得假定能改当前快照。
   */
  render?: (snapshot: TSnapshot) => void
  /**
   * 调度 flush 的宿主。默认 requestAnimationFrame；测试可注入同步队列。
   * 返回值可忽略（兼容 rAF handle）。
   */
  schedule?: (run: () => void) => unknown
}

export interface FrameTransaction<TInput extends Record<string, unknown>, TSnapshot> {
  /** 最近一次成功发布的快照（只读 Signal） */
  readonly published$: ReadonlySignal<TSnapshot>
  /** 已成功发布的帧代际；失败 flush 不增加 */
  readonly generation: number
  /** 当前阶段，调试与不变量检查用 */
  readonly phase: FramePhase
  /**
   * 合并高频输入。idle 写入当前 pending；非 idle 写入 nextPending。
   * 不触发订阅通知。
   */
  writeInput(patch: Partial<TInput>): void
  /**
   * 同步执行一帧事务。无 pending 时返回当前 published，且不通知。
   * @returns 本帧使用的快照（成功时等于 published$.peek()）
   */
  flush(): TSnapshot
  /**
   * 请求在宿主调度器上合并 flush；多次调用在同一 pending 调度内只注册一次。
   */
  scheduleFlush(): void
  /**
   * 从 published 投影只读 Signal。
   * 仅当 select 结果相对上一值 Object.is 不等时通知。
   */
  select<T>(selector: (snapshot: TSnapshot) => T): ReadonlySignal<T>
}

/**
 * 创建帧事务控制器。
 *
 * @typeParam TInput - 可合并的输入形状（浅层 Partial 合并）
 * @typeParam TSnapshot - derive 产出的不可变快照类型
 */
export function createFrameTransaction<
  TInput extends Record<string, unknown>,
  TSnapshot,
>(options: FrameTransactionOptions<TInput, TSnapshot>): FrameTransaction<TInput, TSnapshot> {
  const { derive, render } = options
  const schedule =
    options.schedule ??
    ((run: () => void) => {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(run)
      }
      return setTimeout(run, 0)
    })

  /** 当前代可写入的输入（仅 idle 时接收 writeInput） */
  let pending: TInput = { ...options.initialInput }
  /** 事务进行中产生的输入，complete 后并入下一代 */
  let nextPending: TInput | null = null
  /** 是否存在尚未 flush 的 pending 变更 */
  let dirty = false
  let generation = 0
  let phase: FramePhase = 'idle'
  let scheduleQueued = false

  // generation 0：用初始输入 derive 一次，作为 published 占位，避免订阅者读到 undefined
  const initialSnapshot = derive({ ...pending }, 0)
  const published = createSignal<TSnapshot>(initialSnapshot)

  function writeInput(patch: Partial<TInput>): void {
    if (phase === 'idle') {
      pending = mergeInput(pending, patch)
      dirty = true
      return
    }
    // capturing 之后当前输入已封存；重入写入只能进下一代
    const base = nextPending ?? pending
    nextPending = mergeInput(base, patch)
  }

  function flush(): TSnapshot {
    if (!dirty && nextPending === null) {
      return published.peek()
    }

    // 若仅有 nextPending（例如上一帧 render 中写入），提升为当前 pending
    if (!dirty && nextPending !== null) {
      pending = nextPending
      nextPending = null
      dirty = true
    }

    let sealedInput: TInput | undefined
    phase = 'capturing'
    try {
      sealedInput = pending
      dirty = false
      // 本帧 capture 之后的新写入进入 nextPending，不得污染 sealedInput
      pending = { ...sealedInput }

      phase = 'deriving'
      const nextGeneration = generation + 1
      const snapshot = derive(sealedInput, nextGeneration)

      phase = 'sealing'
      // 浅层冻结快照根对象；大数组字段由 derive 侧做结构共享，禁止在此深拷贝
      if (typeof snapshot === 'object' && snapshot !== null) {
        Object.freeze(snapshot)
      }

      phase = 'rendering'
      render?.(snapshot)

      phase = 'publishing'
      published.set(snapshot)
      generation = nextGeneration

      return snapshot
    } catch (err) {
      // derive/render 失败：不推进 generation，保留 sealed 输入供重试
      if (sealedInput !== undefined) {
        pending = sealedInput
        dirty = true
      }
      throw err
    } finally {
      phase = 'idle'
      // 事务中累积的 nextPending 与重试 pending 合并
      if (nextPending !== null) {
        pending = mergeInput(pending, nextPending)
        nextPending = null
        dirty = true
      }
    }
  }

  function scheduleFlush(): void {
    if (scheduleQueued) return
    if (!dirty && nextPending === null) return
    scheduleQueued = true
    schedule(() => {
      scheduleQueued = false
      flush()
      // flush 内 render 可能再次 dirty；再挂一轮
      if (dirty || nextPending !== null) {
        scheduleFlush()
      }
    })
  }

  function select<T>(selector: (snapshot: TSnapshot) => T): ReadonlySignal<T> {
    const selected = createSignal(selector(published.peek()))
    published.subscribe(() => {
      const next = selector(published.peek())
      selected.set(next)
    })
    const read = (): T => selected()
    return Object.assign(read, {
      peek: selected.peek,
      subscribe: selected.subscribe,
    }) as ReadonlySignal<T>
  }

  return {
    published$: Object.assign((() => published()) as ReadonlySignal<TSnapshot>, {
      peek: published.peek,
      subscribe: published.subscribe,
    }),
    get generation() {
      return generation
    },
    get phase() {
      return phase
    },
    writeInput,
    flush,
    scheduleFlush,
    select,
  }
}
