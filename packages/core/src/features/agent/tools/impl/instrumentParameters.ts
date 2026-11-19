/**
 * 消费端寻址品种的共享参数。
 *
 * 字段、含义与描述都只在这里定义，`instruments_query` 的输出列、行情查询与对比写入
 * 共用同一份契约，避免同一字段在两只工具里各写一遍后漂移。
 */
import { Type } from 'typebox'

import { KNOWN_INSTRUMENT_TYPES } from '../../../../data/provider/types.js'

/** 交易所过滤；同一代码在不同交易所可能是不同标的。 */
export const InstrumentExchangeParameter = Type.Optional(
  Type.String({
    minLength: 1,
    description:
      'Exchange from instruments_query, case-insensitive. Pass it when one symbol exists on several exchanges.',
  }),
)

/** 品种类别过滤；unknown 已从枚举中排除。 */
export const InstrumentTypeParameter = Type.Optional(
  Type.Enum(KNOWN_INSTRUMENT_TYPES, {
    description:
      'Asset class filter from instruments_query. Pass it only when candidates differ by class.',
  }),
)

/** 数据源限定；省略时由 Core 在全部已启用源中解析。 */
export const InstrumentSourceParameter = Type.Optional(
  Type.String({
    minLength: 1,
    description:
      'Data source from instruments_query. Omit to let Core resolve across every enabled source.',
  }),
)
