/**
 * 指标计算调度：把当前计划与预览请求提交给同一执行器，并把结果写入同一个仓库。
 *
 * 图表实例与预览计算没有第二条计算链路；差异只在实例归属与结果池投影。
 */
import type { CalculationPlan, CalculationTask } from '../domain/calculationPlan.js'
import { isResultRevision } from '../domain/calculationPlan.js'
import type { CalculationKey, IndicatorResult } from '../domain/indicatorModel.js'
import type {
  CreateIndicatorCalculationSchedulerOptions,
  IndicatorCalculationScheduler,
  MarketSnapshot,
} from './types.js'

/** 预览结果保留的份数；超出后按最久未提交淘汰。 */
const PREVIEW_RESULT_LIMIT = 16

interface Work {
  readonly task: CalculationTask
  readonly snapshot: MarketSnapshot
  readonly controller: AbortController
  readonly done: Promise<IndicatorResult>
  settle(result: IndicatorResult): void
  fail(error: unknown): void
}

interface Lane {
  task: CalculationTask
  running?: Work
  next?: Work
  settled: boolean
}

/** 同一版本的任务可以直接复用，不需要重新入队。 */
function sameRevision(work: Work | undefined, snapshot: MarketSnapshot): boolean {
  return (
    work !== undefined &&
    work.snapshot.dataRevision === snapshot.dataRevision &&
    work.snapshot.marketRevision === snapshot.marketRevision
  )
}

/** 创建调度器；所有任务都经过 `executor.execute`，结果都写入 `store`。 */
export function createIndicatorCalculationScheduler(
  options: CreateIndicatorCalculationSchedulerOptions,
): IndicatorCalculationScheduler {
  const lanes = new Map<CalculationKey, Lane>()
  /** 进行中的预览任务；只用于复用同一版本的执行。 */
  const previews = new Map<CalculationKey, Work>()
  /** 已提交的预览身份与任务；插入顺序就是淘汰顺序。 */
  const previewTasks = new Map<CalculationKey, CalculationTask>()
  let planKeys = new Set<CalculationKey>()
  let currentPlan: CalculationPlan | null = null
  let projectedRevision = -1
  let disposed = false

  /** 结果池只投影当前计划；预览结果不进图表。 */
  function publishPool(): void {
    if (!currentPlan) return
    options.onCommit(options.store.snapshot(currentPlan))
  }

  /** 构造一个可等待的任务，并把取消信号交还给调用方。 */
  function createWork(task: CalculationTask, snapshot: MarketSnapshot): Work {
    const controller = new AbortController()
    let settle!: (result: IndicatorResult) => void
    let fail!: (error: unknown) => void
    const done = new Promise<IndicatorResult>((resolve, reject) => {
      settle = resolve
      fail = reject
    })
    controller.signal.addEventListener('abort', () => fail(controller.signal.reason), {
      once: true,
    })
    return { task, snapshot, controller, done, settle, fail }
  }

  /** 执行一个任务并把结果写入仓库；失败只影响该任务。 */
  function execute(work: Work, isLane: boolean): void {
    const { task, snapshot, controller } = work
    void options.executor
      .execute(task, snapshot, controller.signal)
      .then((output) => {
        if (disposed || controller.signal.aborted) return
        options.store.publish(output, snapshot)
        const result = options.store.get(task.calculationKey)
        if (!result) throw new Error(`Indicator result was not stored: ${task.calculationKey}`)
        work.settle(result)
        if (isLane) publishPool()
      })
      .catch((error) => {
        if (!controller.signal.aborted) options.onError?.(error)
        work.fail(error)
      })
      .finally(() => {
        if (isLane) finishLane(task.calculationKey, work)
      })
  }

  /** 计划任务完成：清空 running，接着执行最新一版，否则标记已稳定。 */
  function finishLane(key: CalculationKey, work: Work): void {
    const lane = lanes.get(key)
    if (!lane || lane.running !== work) return
    lane.running = undefined
    const next = lane.next
    lane.next = undefined
    if (next) startLane(key, lane, next)
    else {
      lane.settled = true
      options.onPending?.(lane.task.instanceIds, false)
    }
  }

  /** 启动一个计划任务；只保留一个运行项与一个最新待执行项。 */
  function startLane(key: CalculationKey, lane: Lane, work: Work): void {
    lane.running = work
    if (!lane.settled) options.onPending?.(work.task.instanceIds, true)
    execute(work, true)
  }

  /** 把任务合并进 lane：已发布结果与同版本任务复用，新版本替换待执行项。 */
  function enqueueLane(task: CalculationTask, snapshot: MarketSnapshot): void {
    const key = task.calculationKey
    const stored = options.store.get(key)
    if (stored && isResultRevision(stored, snapshot)) return
    let lane = lanes.get(key)
    if (!lane) {
      lane = { task, settled: false }
      lanes.set(key, lane)
    }
    lane.task = task
    if (sameRevision(lane.running, snapshot) || sameRevision(lane.next, snapshot)) return
    const work = createWork(task, snapshot)
    // 图表任务没有等待者；吞掉取消/失败，避免未处理的 Promise 拒绝。
    void work.done.catch(() => undefined)
    if (lane.running) {
      // 行情更新只替换尚未开始的那一版，运行中的计算照常完成并提交。
      lane.next?.controller.abort(new Error('Superseded by newer indicator input'))
      lane.next = work
    } else {
      startLane(key, lane, work)
    }
  }

  /** 预览任务：复用已发布结果或正在运行的计划任务，否则单独提交一次计算。 */
  function runPreview(
    task: CalculationTask,
    snapshot: MarketSnapshot,
    signal?: AbortSignal,
  ): Promise<IndicatorResult> {
    const stored = options.store.get(task.calculationKey)
    if (stored && isResultRevision(stored, snapshot)) return Promise.resolve(stored)
    const running = previews.get(task.calculationKey)
    if (running && sameRevision(running, snapshot)) return running.done
    const laneWork = lanes.get(task.calculationKey)?.running
    if (laneWork && sameRevision(laneWork, snapshot)) return laneWork.done

    const work = createWork(task, snapshot)
    signal?.addEventListener('abort', () => work.controller.abort(signal.reason), { once: true })
    previews.set(task.calculationKey, work)
    rememberPreview(task)
    void work.done
      .catch(() => undefined)
      .finally(() => {
        if (previews.get(task.calculationKey) === work) previews.delete(task.calculationKey)
      })
    trimPreviewResults()
    execute(work, false)
    return work.done
  }

  /** 记录一个需要保留结果的预览身份；同一身份只保留一次。 */
  function rememberPreview(task: CalculationTask): void {
    if (previewTasks.has(task.calculationKey)) return
    previewTasks.set(task.calculationKey, task)
  }

  /** 仓库需要保留的身份：当前计划 + 预览。 */
  function keepKeys(): ReadonlySet<CalculationKey> {
    return new Set([...planKeys, ...previewTasks.keys()])
  }

  /** 预览结果有界；被淘汰的身份同时从仓库中移除。 */
  function trimPreviewResults(): void {
    while (previewTasks.size > PREVIEW_RESULT_LIMIT) {
      const oldest = previewTasks.keys().next().value
      if (oldest === undefined) break
      previewTasks.delete(oldest)
      previews.get(oldest)?.controller.abort(new Error('Preview result evicted'))
      previews.delete(oldest)
    }
    options.store.retain(keepKeys())
  }

  /** 计划变化时移除不再拥有的 lane；预览身份保留。 */
  function retainLanes(): void {
    for (const [key, lane] of lanes) {
      if (planKeys.has(key)) continue
      lane.running?.controller.abort(new Error('Indicator instance removed'))
      lane.next?.controller.abort(new Error('Indicator instance removed'))
      options.onPending?.(lane.task.instanceIds, false)
      lanes.delete(key)
    }
    options.store.retain(keepKeys())
  }

  return {
    refresh(snapshot) {
      if (disposed) return
      const plan = options.pipeline.calculationPlan()
      currentPlan = plan
      planKeys = new Set(plan.tasks.map((task) => task.calculationKey))
      retainLanes()
      options.executor.retain([...plan.tasks, ...previewTasks.values()])
      for (const task of plan.tasks) enqueueLane(task, snapshot)
      if (projectedRevision !== plan.calculationRevision) {
        projectedRevision = plan.calculationRevision
        publishPool()
      }
    },

    submit(task, snapshot, signal) {
      if (disposed) return Promise.reject(new Error('Indicator scheduler is disposed'))
      return runPreview(task, snapshot, signal)
    },

    get(key) {
      return options.store.get(key)
    },

    invalidate() {
      for (const lane of lanes.values()) {
        lane.running?.controller.abort(new Error('Indicator calculation invalidated'))
        lane.next?.controller.abort(new Error('Indicator calculation invalidated'))
        options.onPending?.(lane.task.instanceIds, false)
      }
      lanes.clear()
      for (const work of previews.values())
        work.controller.abort(new Error('Indicator calculation invalidated'))
      previews.clear()
      previewTasks.clear()
      options.store.clear()
      planKeys = new Set()
      currentPlan = null
      projectedRevision = -1
      options.executor.retain([])
    },

    invalidateDefinitions(ids) {
      const changed = new Set(ids)
      for (const task of currentPlan?.tasks ?? []) {
        if (!changed.has(task.definitionId)) continue
        options.store.remove(task.calculationKey)
        projectedRevision = -1
      }
      for (const [key, lane] of lanes) {
        if (!changed.has(lane.task.definitionId)) continue
        lane.running?.controller.abort(new Error('Indicator definition replaced'))
        lane.next?.controller.abort(new Error('Indicator definition replaced'))
        options.onPending?.(lane.task.instanceIds, false)
        lanes.delete(key)
      }
      for (const [key, task] of previewTasks) {
        if (!changed.has(task.definitionId)) continue
        options.store.remove(key)
        previews.get(key)?.controller.abort(new Error('Indicator definition replaced'))
        previews.delete(key)
        previewTasks.delete(key)
      }
    },

    dispose() {
      if (disposed) return
      this.invalidate()
      disposed = true
    },
  }
}
