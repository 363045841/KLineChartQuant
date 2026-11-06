/** 按计算身份合并实时输入：一项运行、一项最新待执行；输入更新不取消运行。 */
import type { IndicatorCalculationTask } from '../domain/instanceCalculationPlan.js'
import { InstanceResultStore } from './instanceResultStore.js'
import type {
  CreateInstanceCalculationSchedulerOptions,
  IndicatorCalculationInput,
} from './types.js'

interface Work {
  readonly input: IndicatorCalculationInput
  readonly marketRevision: number
  readonly done: Promise<boolean>
  readonly settle: (published: boolean) => void
}
interface Lane {
  task: IndicatorCalculationTask
  readonly abort: AbortController
  running?: Work
  next?: Work
  completed?: Work
}

/** 计算版本只用于去重，生命周期取消只用于删除、定义/参数替换、会话切换与销毁。 */
export function createInstanceCalculationScheduler(
  options: CreateInstanceCalculationSchedulerOptions,
) {
  const lanes = new Map<string, Lane>()
  const results = new InstanceResultStore()
  let disposed = false
  let requestId = 0
  let latest: IndicatorCalculationInput | undefined
  let projectedPlanRevision = -1

  const active = (key: string, lane: Lane) =>
    !disposed && lanes.get(key) === lane && !lane.abort.signal.aborted
  const pending = (lane: Lane, value: boolean) => options.onPending?.(lane.task.instanceIds, value)

  /** 只发布当前计划中的身份；进行中的旧时间轴不会覆盖新会话。 */
  function commit(): void {
    if (!latest || disposed) return
    const plan = options.pipeline.calculationPlan()
    results.retain(plan)
    options.onCommit({ requestId, pool: results.snapshot(plan, latest) })
  }

  /** 终止已失去使用者的任务；普通行情更新不经过这里。 */
  function remove(key: string, lane: Lane): void {
    lanes.delete(key)
    lane.abort.abort()
    lane.running?.settle(false)
    lane.next?.settle(false)
    pending(lane, false)
  }

  /** 完成后直接领取最新输入，不积累中间tick，也不让其它指标等待。 */
  function start(key: string, lane: Lane, work: Work): void {
    lane.running = work
    pending(lane, true)
    void Promise.resolve()
      .then(() => {
        lane.abort.signal.throwIfAborted()
        return options.executor.execute(lane.task, work.input.data, lane.abort.signal)
      })
      .then((output) => {
        if (!active(key, lane)) return
        if (!options.pipeline.calculationPlan().tasks.some((task) => task.calculationKey === key))
          return
        results.publish(output, work.input)
        lane.completed = work
        commit()
        work.settle(true)
      })
      .catch((error) => {
        if (active(key, lane)) options.onError?.(error)
        work.settle(false)
      })
      .finally(() => {
        if (!active(key, lane)) return
        lane.running = undefined
        const next = lane.next
        lane.next = undefined
        if (next) start(key, lane, next)
        else pending(lane, false)
        work.settle(false)
      })
  }

  /** 清空执行域；例如切换品种时先出现空数据快照。 */
  function invalidate(): void {
    for (const [key, lane] of lanes) remove(key, lane)
    options.executor.retain([])
    results.clear()
    latest = undefined
    projectedPlanRevision = -1
  }

  return {
    invalidate,
    /** 源码替换是生命周期事件，只撤销受影响的定义，其它指标继续运行。 */
    invalidateDefinitions(ids: readonly string[]) {
      for (const [key, lane] of lanes) {
        if (!ids.includes(lane.task.definitionId)) continue
        remove(key, lane)
      }
    },
    dispose() {
      invalidate()
      disposed = true
    },
    compute(input: IndicatorCalculationInput): Promise<boolean> {
      if (disposed) return Promise.resolve(false)
      if (latest && input.dataRevision < latest.dataRevision)
        return Promise.reject(new RangeError('Indicator data revision moved backwards'))
      latest = { ...input, timestamps: Object.freeze([...input.timestamps]) }
      requestId++
      const plan = options.pipeline.calculationPlan()
      const tasks = new Map(plan.tasks.map((task) => [task.calculationKey, task]))
      for (const [key, lane] of lanes) if (!tasks.has(key)) remove(key, lane)
      options.executor.retain(plan.tasks)
      const marketRevision = options.executor.revision
      const waits: Promise<boolean>[] = []
      for (const [key, task] of tasks) {
        let lane = lanes.get(key)
        if (!lane) {
          lane = { task, abort: new AbortController() }
          lanes.set(key, lane)
        }
        const removedIds = lane.task.instanceIds.filter((id) => !task.instanceIds.includes(id))
        if (removedIds.length) options.onPending?.(removedIds, false)
        lane.task = task
        const current = lane.next ?? lane.running ?? lane.completed
        if (
          current &&
          current.input.dataRevision === input.dataRevision &&
          current.marketRevision === marketRevision
        ) {
          waits.push(current.done)
          pending(lane, !!(lane.running || lane.next))
          continue
        }
        let settle!: (published: boolean) => void
        const done = new Promise<boolean>((resolve) => {
          settle = resolve
        })
        const work: Work = { input: latest, marketRevision, done, settle }
        waits.push(done)
        if (lane.running) {
          lane.next?.settle(false)
          lane.next = work
          pending(lane, true)
        } else start(key, lane, work)
      }
      // 只有实例关系变化才重投影已有结果；普通tick等待真正的计算完成再发布。
      if (projectedPlanRevision !== plan.calculationRevision) {
        projectedPlanRevision = plan.calculationRevision
        commit()
      }
      return Promise.all(waits).then((published) => published.every(Boolean))
    },
  }
}
