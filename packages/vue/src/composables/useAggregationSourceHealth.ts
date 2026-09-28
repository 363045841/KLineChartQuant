/**
 * 聚合源拨测状态共享仓库：选择器 Tab 过滤与聚合源管理弹窗共用同一份在线状态和拨测请求，
 * 避免同一数据源被多处重复拨测，也保证两处展示一致。
 */
import { computed, readonly, ref } from 'vue'

import {
  type AggregationSourceDefinition,
  type AggregationSourceStatus,
  probeAggregationSource,
  supportsAggregationSourceSearch,
} from './useAggregationSources.js'

/** 单个数据源的最近一次拨测结果。 */
export interface AggregationSourceHealth {
  status: AggregationSourceStatus
  /** 在线时的请求延迟毫秒 */
  latencyMs?: number
  /** 连接器附带的补充说明（如对齐摘要/离线原因） */
  message?: string
}

/** 拨测超时；连接器无响应时兜底，避免长期停留在检测中。 */
const PROBE_TIMEOUT_MS = 5000

/** 结果复用时长；避免弹层反复开关都触发拨测。 */
const HEALTH_TTL_MS = 15_000

const health = ref<Record<string, AggregationSourceHealth>>({})
let controller: AbortController | undefined
let requestId = 0
let lastProbeAt = 0

/** 在线源名称集合，供 Tab 过滤离线源。 */
const onlineNameSet = computed<ReadonlySet<string>>(() => {
  const names = new Set<string>()
  for (const [name, entry] of Object.entries(health.value)) {
    if (entry.status === 'online') names.add(name)
  }
  return names
})

/** 解析拨测目标：只有可搜索源能参与聚合搜索，也只有它们需要健康状态。 */
function resolveTargets(
  sources: ReadonlyArray<AggregationSourceDefinition>,
  names?: ReadonlySet<string>,
): ReadonlyArray<AggregationSourceDefinition> {
  return sources.filter(
    (source) =>
      supportsAggregationSourceSearch(source) && (names === undefined || names.has(source.name)),
  )
}

/**
 * 拨测数据源健康状态并写入共享仓库。
 * @param sources 全部候选源
 * @param options.names 限定拨测的源；省略时拨测全部可搜索源（弹窗需要展示已禁用源的状态）
 * @param options.force 忽略 TTL 强制拨测；默认仅在缓存过期或存在未检测源时拨测
 * @returns 本轮拨测完成的 Promise，供测试等待
 */
export function refreshAggregationSourceHealth(
  sources: ReadonlyArray<AggregationSourceDefinition>,
  options: { names?: ReadonlySet<string>; force?: boolean } = {},
): Promise<void> {
  const targets = resolveTargets(sources, options.names)
  if (targets.length === 0) return Promise.resolve()
  const covered = targets.every((source) => health.value[source.name] !== undefined)
  if (!options.force && covered && Date.now() - lastProbeAt < HEALTH_TTL_MS)
    return Promise.resolve()

  controller?.abort()
  const nextController = new AbortController()
  controller = nextController
  const currentRequestId = ++requestId
  lastProbeAt = Date.now()

  // 强制拨测时把所有目标重置为检测中；否则保留已有结果，仅补上从未检测过的源
  const nextHealth: Record<string, AggregationSourceHealth> = { ...health.value }
  for (const source of targets) {
    if (options.force || nextHealth[source.name] === undefined) {
      nextHealth[source.name] = { status: 'checking' }
    }
  }
  health.value = nextHealth

  const timeout = setTimeout(() => nextController.abort(), PROBE_TIMEOUT_MS)
  return Promise.all(
    targets.map(async (source) => {
      const result = await probeAggregationSource(source, nextController.signal)
      if (currentRequestId !== requestId) return
      const entry: AggregationSourceHealth = { status: result.status }
      if (result.latencyMs !== undefined) entry.latencyMs = result.latencyMs
      if (result.message) entry.message = result.message
      health.value = { ...health.value, [source.name]: entry }
    }),
  )
    .then(() => undefined)
    .finally(() => {
      clearTimeout(timeout)
      if (currentRequestId === requestId) controller = undefined
    })
}

/** 取消进行中的拨测；已写入的检测中状态保留，下次刷新会覆盖。 */
export function cancelAggregationSourceHealthProbe(): void {
  controller?.abort()
  controller = undefined
  requestId++
}

/** 清空共享状态；用于测试隔离。 */
export function resetAggregationSourceHealth(): void {
  cancelAggregationSourceHealthProbe()
  health.value = {}
  lastProbeAt = 0
}

/** 组件侧访问共享拨测状态。 */
export function useAggregationSourceHealth() {
  return {
    health: readonly(health),
    onlineNameSet,
    refresh: refreshAggregationSourceHealth,
    cancel: cancelAggregationSourceHealthProbe,
    reset: resetAggregationSourceHealth,
  }
}
