// 本文件定义 Agent 查询指标计算结果的 MVP 接口、DTO 与查询服务。

import { INDICATOR_QUERY_ERROR_CODES, KLineChartError } from '../../errors'
import { getRegisteredIndicatorDefinition } from '../../engine/indicators/indicatorDefinitionRegistry'
import type { IndicatorMetadata } from '../../engine/indicators/indicatorMetadata'
import { findFirstReadyIndex } from '../../engine/indicators/indicatorRuntime'
import type { DataStateModule } from '../../engine/state/dataState'
import { INDICATOR_RESULT_OWNER } from '../../engine/state/indicatorResultModel'
import type { IndicatorResultStateModule } from '../../engine/state/indicatorResultState'

// 默认返回数据点数量
const DEFAULT_QUERY_LIMIT = 100
// 限制单次 DTO 体积，防止 Agent 无界拉取完整历史序列。
const MAX_QUERY_LIMIT = 2000
// 行情在计算期间变化时最多重试一次，避免持续更新导致查询长期占用主线程。
const MAX_DATA_REVISION_ATTEMPTS = 2
// 标量指标统一使用 value 作为 DTO 字段名。
const SCALAR_VALUE_FIELD = 'value'
// Agent 结果池键使用独立前缀，避免与图表 instanceId 混淆。
const AGENT_RESULT_ID_PREFIX = 'agent'

/** 查询服务依赖，允许测试或宿主替换指标定义解析器。 */
export interface IndicatorQueryDependencies {
  readonly dataState: DataStateModule
  readonly resultState: IndicatorResultStateModule
  readonly resolveDefinition?: (
    definitionId: string,
  ) => Pick<IndicatorMetadata, 'name' | 'runtime'> | undefined
}

/** 调用指标计算链路并返回当前行情对应的查询结果。 */
export interface IndicatorQuery {
  queryIndicator(input: IndicatorQueryInput): Promise<IndicatorQueryResult>
}

/** Agent 发起一次指标计算查询所需的参数。 */
export interface IndicatorQueryInput {
  readonly definitionId: string
  readonly params?: Readonly<Record<string, number>>
  readonly from?: number
  readonly to?: number
  readonly limit?: number
}

/** 单个时间点的指标字段值，null 表示历史数据不足以产生有效指标值或该字段缺失。 */
export interface IndicatorQueryPoint {
  readonly timestamp: number
  readonly values: Readonly<Record<string, number | null>>
}

/** Agent 可读取的指标查询结果。 */
export interface IndicatorQueryResult {
  readonly definitionId: string
  readonly params: Readonly<Record<string, number>>
  readonly points: readonly IndicatorQueryPoint[]
}

/** 校验查询参数并返回规范化输入。 */
function normalizeInput(input: IndicatorQueryInput): Required<IndicatorQueryInput> {
  const definitionId = input.definitionId.trim()
  if (!definitionId) {
    throw new KLineChartError(
      INDICATOR_QUERY_ERROR_CODES.INVALID_QUERY,
      'Indicator definitionId must not be empty',
    )
  }

  const params: Record<string, number> = {}
  for (const [name, value] of Object.entries(input.params ?? {})) {
    if (!name.trim() || !Number.isFinite(value)) {
      throw new KLineChartError(
        INDICATOR_QUERY_ERROR_CODES.INVALID_QUERY,
        `Indicator parameter '${name}' must be a finite number`,
      )
    }
    params[name] = value
  }

  const invalidFrom = input.from !== undefined && !Number.isFinite(input.from)
  const invalidTo = input.to !== undefined && !Number.isFinite(input.to)
  const from = input.from ?? Number.NEGATIVE_INFINITY
  const to = input.to ?? Number.POSITIVE_INFINITY
  if (invalidFrom || invalidTo || from > to) {
    throw new KLineChartError(
      INDICATOR_QUERY_ERROR_CODES.INVALID_QUERY,
      'Indicator query time range is invalid',
    )
  }

  const limit = input.limit ?? DEFAULT_QUERY_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
    throw new KLineChartError(
      INDICATOR_QUERY_ERROR_CODES.INVALID_QUERY,
      `Indicator query limit must be an integer between 1 and ${MAX_QUERY_LIMIT}`,
    )
  }

  return { definitionId, params, from, to, limit }
}

/** 从同一 Runtime 参数模型生成 calculator 配置和 Agent 数字参数快照。 */
function resolveCalculationParams(
  definition: Pick<IndicatorMetadata, 'name' | 'runtime'>,
  params: Readonly<Record<string, number>>,
): {
  readonly calculationConfig: Readonly<Record<string, unknown>>
  readonly numericParams: Readonly<Record<string, number>>
} {
  const defaultParams = definition.runtime?.defaultParams
  const defaults =
    typeof defaultParams === 'function'
      ? (defaultParams as () => Record<string, unknown>)()
      : ((defaultParams ?? {}) as Record<string, unknown>)
  const calculationConfig: Record<string, unknown> = { ...defaults }
  const numericParams: Record<string, number> = {}
  for (const [name, defaultValue] of Object.entries(defaults)) {
    if (typeof defaultValue !== 'number') continue
    numericParams[name] = params[name] ?? defaultValue
  }
  for (const [name, value] of Object.entries(params)) {
    if (typeof defaults[name] !== 'number') {
      throw new KLineChartError(
        INDICATOR_QUERY_ERROR_CODES.INVALID_QUERY,
        `Indicator parameter '${name}' is not a registered numeric calculation parameter`,
      )
    }
    calculationConfig[name] = value
  }
  return {
    calculationConfig: Object.freeze(calculationConfig),
    numericParams: Object.freeze(numericParams),
  }
}

/** 为相同指标和参数生成稳定的 Agent 结果池键。 */
function createAgentResultId(
  definitionId: string,
  params: Readonly<Record<string, number>>,
): string {
  const sortedParams = Object.entries(params).sort(([left], [right]) => left.localeCompare(right))
  return `${AGENT_RESULT_ID_PREFIX}:${definitionId}:${JSON.stringify(sortedParams)}`
}

/** 读取数组单点中的数值字段，非有限数值统一转换为 null，保证返回值能够安全 JSON 序列化。 */
function readArrayPointValues(item: unknown, fields: ReadonlyArray<string>) {
  if (fields.length === 1 && fields[0] === SCALAR_VALUE_FIELD) {
    return Object.freeze({
      [SCALAR_VALUE_FIELD]: typeof item === 'number' && Number.isFinite(item) ? item : null,
    })
  }
  const source = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {}
  const values: Record<string, number | null> = {}
  for (const field of fields) {
    const value = source[field]
    values[field] = typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  return Object.freeze(values)
}

/** 推导按 K 线对齐数组的稳定 DTO 字段名。 */
function resolveArrayFields(series: ReadonlyArray<unknown>): ReadonlyArray<string> {
  const numericFields = new Set<string>()
  let fallbackFields: ReadonlyArray<string> = []
  for (const item of series) {
    if (typeof item === 'number') return [SCALAR_VALUE_FIELD]
    if (item === null || typeof item !== 'object') continue
    const entries = Object.entries(item)
    if (fallbackFields.length === 0 && entries.length > 0) {
      fallbackFields = entries.map(([field]) => field)
    }
    for (const [field, value] of entries) {
      if (typeof value === 'number') numericFields.add(field)
    }
  }
  if (numericFields.size > 0) return [...numericFields]
  return fallbackFields.length > 0 ? fallbackFields : [SCALAR_VALUE_FIELD]
}

/** 将 calculator 原始结果转换为每个 K 线下标对应的字段读取器。 */
function createValueReader(
  series: unknown,
  dataLength: number,
): (index: number) => Readonly<Record<string, number | null>> {
  if (Array.isArray(series) && series.length === dataLength) {
    const fields = resolveArrayFields(series)
    return (index) => readArrayPointValues(series[index], fields)
  }

  if (series !== null && typeof series === 'object') {
    const alignedFields = Object.entries(series as Record<string, unknown>).filter(
      (entry): entry is [string, ReadonlyArray<unknown>] =>
        Array.isArray(entry[1]) && entry[1].length === dataLength,
    )
    if (alignedFields.length > 0) {
      return (index) => {
        const values: Record<string, number | null> = {}
        for (const [field, fieldSeries] of alignedFields) {
          const value = fieldSeries[index]
          values[field] = typeof value === 'number' && Number.isFinite(value) ? value : null
        }
        return Object.freeze(values)
      }
    }
  }

  throw new KLineChartError(
    INDICATOR_QUERY_ERROR_CODES.UNSUPPORTED_OUTPUT,
    'Indicator output cannot be represented as bar-aligned points',
  )
}

/** 按时间范围选取最近的指定数量 K 线下标。 */
function selectPointIndexes(
  timestamps: ReadonlyArray<number>,
  from: number,
  to: number,
  limit: number,
): ReadonlyArray<number> {
  const indexes: number[] = []
  for (let index = 0; index < timestamps.length; index++) {
    const timestamp = timestamps[index]!
    if (timestamp >= from && timestamp <= to) indexes.push(index)
  }
  return indexes.length > limit ? indexes.slice(indexes.length - limit) : indexes
}

/** 创建调用现有 calculator、写入结果池并返回受限 DTO 的查询服务。 */
export function createIndicatorQuery(dependencies: IndicatorQueryDependencies): IndicatorQuery {
  const resolveDefinition = dependencies.resolveDefinition ?? getRegisteredIndicatorDefinition

  return {
    /** 使用完整活动行情计算指标，再按查询范围转换返回结果。 */
    async queryIndicator(input: IndicatorQueryInput): Promise<IndicatorQueryResult> {
      const query = normalizeInput(input)
      const definition = resolveDefinition(query.definitionId)
      const runtime = definition?.runtime
      if (!definition || !runtime) {
        throw new KLineChartError(
          INDICATOR_QUERY_ERROR_CODES.INDICATOR_NOT_REGISTERED,
          `Indicator '${query.definitionId}' is not registered for calculation`,
        )
      }
      if (runtime.outputAlignment === 'aggregate') {
        throw new KLineChartError(
          INDICATOR_QUERY_ERROR_CODES.UNSUPPORTED_OUTPUT,
          `Indicator '${definition.name}' does not produce bar-aligned output`,
        )
      }

      const { calculationConfig, numericParams } = resolveCalculationParams(
        definition,
        query.params,
      )
      const agentResultId = createAgentResultId(definition.name, numericParams)

      for (let attempt = 0; attempt < MAX_DATA_REVISION_ATTEMPTS; attempt++) {
        const dataSnapshot = dependencies.dataState.readonly.activeBuffer.peek()
        if (dataSnapshot.kind !== 'bars' || dataSnapshot.data.length === 0) {
          throw new KLineChartError(
            INDICATOR_QUERY_ERROR_CODES.MARKET_DATA_UNAVAILABLE,
            'Indicator query requires active K-line data',
          )
        }

        // 使用完整行情计算，避免 from/to 截断指标所需的历史窗口
        const series = runtime.compute([...dataSnapshot.data], calculationConfig)
        const latestDataSnapshot = dependencies.dataState.readonly.activeBuffer.peek()
        if (latestDataSnapshot.dataRevision !== dataSnapshot.dataRevision) continue

        const timestamps = dataSnapshot.data.map((item) => item.timestamp)
        const committed = dependencies.resultState.actions.commitResults({
          owner: INDICATOR_RESULT_OWNER.AGENT,
          dataRevision: dataSnapshot.dataRevision,
          timestamps,
          result: {
            agentResultId,
            definitionId: definition.name,
            params: numericParams,
            series,
            firstReadyIndex: findFirstReadyIndex(series, dataSnapshot.data.length),
          },
        })
        if (!committed) continue

        const pool = dependencies.resultState.readonly.snapshot.peek().pool
        const storedResult = pool?.results.get(agentResultId)
        if (
          pool?.dataRevision !== dataSnapshot.dataRevision ||
          storedResult?.owner !== INDICATOR_RESULT_OWNER.AGENT
        ) {
          continue
        }

        const readValues = createValueReader(storedResult.series, timestamps.length)
        const points = selectPointIndexes(timestamps, query.from, query.to, query.limit).map(
          (index) => Object.freeze({ timestamp: timestamps[index]!, values: readValues(index) }),
        )
        return Object.freeze({
          definitionId: definition.name,
          params: numericParams,
          points: Object.freeze(points),
        })
      }

      throw new KLineChartError(
        INDICATOR_QUERY_ERROR_CODES.RESULT_COMMIT_FAILED,
        'Market data changed before the indicator result could be committed',
      )
    },
  }
}
