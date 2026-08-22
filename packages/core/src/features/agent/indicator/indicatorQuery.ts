// 本文件保留既有 Agent 指标查询入参，并将纯计算结果直接转义为紧凑文本。

import { INDICATOR_QUERY_ERROR_CODES, KLineChartError } from '../../../errors'
import { getRegisteredIndicatorDefinition } from '../../../engine/indicators/indicatorDefinitionRegistry'
import type { IndicatorMetadata } from '../../../engine/indicators/indicatorMetadata'
import type { DataStateModule } from '../../../engine/state/dataState'
import { createIndicatorTextFormatter, type IndicatorTextFormatter } from './indicatorTextFormatter'

// 默认限制文本中返回的结果条目数量。
const DEFAULT_QUERY_LIMIT = 20
// 限制单次文本体积，防止 Agent 无界读取完整历史序列。
const MAX_QUERY_LIMIT = 2000
// 行情在计算期间变化时最多重试一次，避免持续更新导致查询长期占用主线程。
const MAX_DATA_REVISION_ATTEMPTS = 2
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
  queryIndicator(input: IndicatorQueryInput): Promise<string>
}

/** Agent 发起一次指标查询所需的参数，保持原有调用契约。 */
export interface IndicatorQueryInput {
  readonly definitionId: string
  readonly params?: Readonly<Record<string, number>>
  readonly from?: number
  readonly to?: number
  readonly limit?: number
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

/** 创建调用既有 calculator 并直接返回文本的查询服务。 */
export function createIndicatorQuery(dependencies: IndicatorQueryDependencies): IndicatorQuery {
  const resolveDefinition = dependencies.resolveDefinition ?? getRegisteredIndicatorDefinition
  const textFormatter = dependencies.textFormatter ?? createIndicatorTextFormatter()

  return {
    /** 使用完整活动行情计算指标，并将纯计算结果直接转义为文本。 */
    async queryIndicator(input: IndicatorQueryInput): Promise<string> {
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
