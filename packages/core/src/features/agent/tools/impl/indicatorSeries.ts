/** 指标序列读取工具：读图上实例或按输入计算一次，返回列、行与绘图对象。 */
import { Type } from 'typebox'
import type {
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorSeriesQuery,
  ChartAgentIndicatorSeriesResult,
} from '../../types.js'
import { INDICATOR_SERIES_DEFAULT_LIMIT, INDICATOR_SERIES_MAX_LIMIT } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult } from './helpers.js'

export const INDICATOR_SERIES_QUERY_METADATA: ChartToolMetadata = {
  name: 'indicator_series_query',
  label: 'Query indicator series',
  description:
    'Read the values an indicator produces on the current chart. Without inputs it reads the chart instance; with inputs it computes once with those inputs and leaves the chart unchanged. ' +
    'Returns series.columns and series.rows, where each row is [index, time, ...values] aligned to the column order. ' +
    'Also returns the drawings (line/box/label) and hlines the indicator produced. ' +
    'Narrow with from/to and limit; a truncated field reports how many items were cut.',
  effect: 'read',
}

const IndicatorInputValue = Type.Union([Type.Number(), Type.String(), Type.Boolean()])

const IndicatorSeriesParameters = Type.Object(
  {
    indicator: Type.String({
      minLength: 1,
      description: 'Indicator name or id as returned by indicators_list.',
    }),
    row: Type.Optional(
      Type.Integer({
        minimum: 0,
        description: 'Display row; required when the name appears twice.',
      }),
    ),
    order: Type.Optional(
      Type.Integer({ minimum: 1, description: 'Position inside the row; required to split ties.' }),
    ),
    inputs: Type.Optional(
      Type.Record(Type.String(), IndicatorInputValue, {
        description:
          'Complete or partial inputs keyed by input name. Omitted keys use the definition defaults.',
      }),
    ),
    from: Type.Optional(
      Type.String({
        description:
          'Window start, inclusive. "YYYY-MM-DD" for daily and above; RFC 3339 with offset for intraday.',
      }),
    ),
    to: Type.Optional(Type.String({ description: 'Window end, inclusive. Same format as from.' })),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: INDICATOR_SERIES_MAX_LIMIT,
        description: `Maximum rows and objects to return. Defaults to ${INDICATOR_SERIES_DEFAULT_LIMIT}.`,
      }),
    ),
  },
  { additionalProperties: false },
)

/** 摘要描述本次返回，不重复输入。 */
function summarize(indicator: string, result: ChartAgentIndicatorSeriesResult): string {
  const rows = result.series.rows.length
  const parts = [`Returned ${rows} row(s) for ${indicator}`]
  if (result.objects.length > 0) parts.push(`${result.objects.length} object(s)`)
  if (result.hlines.length > 0) parts.push(`${result.hlines.length} hline(s)`)
  const cut = result.truncated
  const detail = cut === undefined ? '' : ` (truncated: rows ${cut.rows}, objects ${cut.objects})`
  return `${parts.join(', ')}${detail}.`
}

/** 读取指标数值序列；定位与输入校验由命令面完成。 */
export function createIndicatorSeriesQueryTool(
  indicators: ChartAgentIndicatorCommands,
): ChartToolDefinition {
  return {
    ...INDICATOR_SERIES_QUERY_METADATA,
    parameters: IndicatorSeriesParameters,
    summarizeInput: (input) => (input as ChartAgentIndicatorSeriesQuery).indicator,
    async execute(input, context) {
      const query = input as ChartAgentIndicatorSeriesQuery
      const result = await indicators.series(query, context)
      return jsonResult(result, summarize(query.indicator, result))
    },
  }
}
