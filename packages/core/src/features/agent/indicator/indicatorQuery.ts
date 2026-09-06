// 本文件执行指标计算，并将纯计算结果直接转义为紧凑文本。

import { getRegisteredIndicatorDefinition } from '../../../engine/indicators/indicatorDefinitionRegistry'
import { INDICATOR_QUERY_ERROR_CODES, KLineChartError } from '../../../errors'

import { createIndicatorTextFormatter, type IndicatorTextFormatter } from './indicatorTextFormatter'

import type { IndicatorMetadata } from '../../../engine/indicators/indicatorMetadata'
import type { DataStateModule } from '../../../engine/state/dataState'
import type { IndicatorQueryInput as AgentIndicatorQueryInput } from '../types'

// 默认限制文本中返回的结果条目数量。
const DEFAULT_QUERY_LIMIT = 20
// 限制单次文本体积，防止 Agent 无界读取完整历史序列。
const MAX_QUERY_LIMIT = 2000
// 行情在计算期间变化时最多重试一次，避免持续更新导致查询长期占用主线程。
const MAX_DATA_REVISION_ATTEMPTS = 2

/** 指标计算的内部输入，可按时间范围筛选结果；不作为 Agent 工具契约暴露。 */
type IndicatorCalculationQueryInput = AgentIndicatorQueryInput & {
  readonly from?: number
  readonly to?: number
}

/** 查询服务依赖，允许测试或宿主替换指标定义解析器和文本转义器。 */
export interface IndicatorQueryDependencies {
  readonly dataState: DataStateModule
  readonly resolveDefinition?: (
    definitionId: string,
  ) => Pick<IndicatorMetadata, 'name' | 'runtime'> | undefined
  readonly textFormatter?: IndicatorTextFormatter
}

/** 调用既有指标计算链路并返回紧凑文本。 */
export interface IndicatorQuery {
  queryIndicator(input: IndicatorCalculationQueryInput): Promise<string>
}

/** 校验查询参数并返回规范化输入。 */
function normalizeInput(
  input: IndicatorCalculationQueryInput,
): Required<IndicatorCalculationQueryInput> {
  const definitionId = typeof input?.definitionId === 'string' ? input.definitionId.trim() : ''
  if (!definitionId || (input.params !== undefined && !isNumericParams(input.params))) {
    throw new KLineChartError(
      INDICATOR_QUERY_ERROR_CODES.INVALID_QUERY,
      'Indicator query requires a definitionId and a numeric params object',
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

function isNumericParams(value: unknown): value is Readonly<Record<string, number>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

/** 创建调用既有 calculator 并直接返回文本的查询服务。 */
export function createIndicatorQuery(dependencies: IndicatorQueryDependencies): IndicatorQuery {
  const resolveDefinition = dependencies.resolveDefinition ?? getRegisteredIndicatorDefinition
  const textFormatter = dependencies.textFormatter ?? createIndicatorTextFormatter()

  return {
    /** 使用完整活动行情计算指标，并将纯计算结果直接转义为文本。 */
    async queryIndicator(input: IndicatorCalculationQueryInput): Promise<string> {
      const query = normalizeInput(input)
      const definition = resolveDefinition(query.definitionId)
      const runtime = definition?.runtime
      if (!definition || !runtime) {
        throw new KLineChartError(
          INDICATOR_QUERY_ERROR_CODES.INDICATOR_NOT_REGISTERED,
          `Indicator '${query.definitionId}' is not registered for calculation`,
        )
      }

      const { calculationConfig, numericParams } = resolveCalculationParams(
        definition,
        query.params,
      )
      for (let attempt = 0; attempt < MAX_DATA_REVISION_ATTEMPTS; attempt++) {
        const dataSnapshot = dependencies.dataState.readonly.activeBuffer.peek()
        if (dataSnapshot.kind !== 'bars' || dataSnapshot.data.length === 0) {
          throw new KLineChartError(
            INDICATOR_QUERY_ERROR_CODES.MARKET_DATA_UNAVAILABLE,
            'Indicator query requires active K-line data',
          )
        }
        if (
          !dataSnapshot.data.some(
            (item) => item.timestamp >= query.from && item.timestamp <= query.to,
          )
        ) {
          throw new KLineChartError(
            INDICATOR_QUERY_ERROR_CODES.RANGE_EMPTY,
            'Indicator query time range contains no active K-line data',
          )
        }

        // 使用完整行情计算，避免 from/to 截断指标所需的历史窗口。
        const series = runtime.compute([...dataSnapshot.data], calculationConfig)
        const latestDataSnapshot = dependencies.dataState.readonly.activeBuffer.peek()
        if (latestDataSnapshot.dataRevision !== dataSnapshot.dataRevision) continue

        return textFormatter.format({
          definitionId: definition.name,
          params: numericParams,
          timestamps: dataSnapshot.data.map((item) => item.timestamp),
          series,
          from: query.from,
          to: query.to,
          limit: query.limit,
        })
      }

      throw new KLineChartError(
        INDICATOR_QUERY_ERROR_CODES.RESULT_COMMIT_FAILED,
        'Market data changed before the indicator result could be committed',
      )
    },
  }
}
