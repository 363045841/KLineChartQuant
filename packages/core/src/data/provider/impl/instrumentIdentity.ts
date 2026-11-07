/**
 * 品种标识的单一实现：身份键、前缀断言、展示标签与搜索输入解析。
 *
 * `instrument.id` 已自带 `sourceId` 前缀（`binance:spot:BTCUSDT`、`mt5:XAUUSD`），
 * 因此身份键就是 id 本身，任何再拼一次 sourceId 的做法都会产生 `binance:binance:...` 这样的双层前缀。
 */

import type { InstrumentDescriptor, ProviderRef } from '../types.js'

/** 身份键的输入：只需要 id 与 sourceId 两个字段。 */
type InstrumentIdentityLike = Pick<InstrumentDescriptor, 'id' | 'sourceId'>

/** 展示标签的输入：代码与数据源私有路由引用。 */
type InstrumentLabelLike = Pick<InstrumentDescriptor, 'symbol'> & {
  providerRef?: ProviderRef
}

/** id 的分段分隔符；各 connector 的尾段语法由自己拥有，核心层不解读。 */
const ID_SEPARATOR = ':'

/**
 * 永续市场在 `providerRef.market` 中的取值，与 Binance connector 的 `market` 参数同值。
 * `.P` 后缀是 TradingView 的展示惯例（现货无后缀、永续追加 `.P`），不是某一家 connector 的私有语法。
 */
const PERPETUAL_MARKET = 'perp'

/** 永续品种在展示代码上追加的后缀。 */
const PERPETUAL_CODE_SUFFIX = '.P'

/**
 * 判断 id 是否属于该数据源。
 *
 * 只比较第一段，不解析尾段：Binance 是 `<market>:<symbol>`，MT5 只有 `<symbol>`，
 * GOTDX 是 `<kind>:<key>:<symbol>`，统一成一种语法会把市场维度强加给所有源。
 * @param id 品种标识
 * @param sourceId 数据源标识
 */
export function isInstrumentIdOfSource(id: string, sourceId: string): boolean {
  const trimmedId = id.trim()
  const trimmedSource = sourceId.trim()
  if (!trimmedId || !trimmedSource) return false
  const separatorIndex = trimmedId.indexOf(ID_SEPARATOR)
  if (separatorIndex <= 0) return false
  return trimmedId.slice(0, separatorIndex) === trimmedSource
}

/**
 * 生成数据源范围内品种的稳定身份键。
 *
 * 直接返回 id：id 已是全局唯一标识，再拼 sourceId 会得到 `binance:binance:spot:BTCUSDT`，
 * 既不利于比较，也会在跨数据源聚合时产生假冲突。
 * @param instrument 品种
 */
export function instrumentIdentityKey(instrument: InstrumentIdentityLike): string {
  return instrument.id.trim()
}

/** 把数据源私有路由里的市场字段取出；缺失或非字符串时不给市场。 */
function readMarket(providerRef: ProviderRef | undefined): string | undefined {
  const value = providerRef?.market
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

/**
 * 生成展示用的代码与市场标签。
 *
 * 永续品种的展示代码追加 `.P`（TradingView 惯例），现货与非多市场品种保持原代码。
 * `symbol` 本体不写入后缀：它仍是后端 API 参数，`BTCUSDT.P` 只存在于展示与输入层。
 * @param instrument 品种
 */
export function formatInstrumentLabel(instrument: InstrumentLabelLike): {
  code: string
  market?: string
} {
  const market = readMarket(instrument.providerRef)
  if (market === undefined) return { code: instrument.symbol }
  return {
    code:
      market === PERPETUAL_MARKET
        ? `${instrument.symbol}${PERPETUAL_CODE_SUFFIX}`
        : instrument.symbol,
    market,
  }
}

/** 搜索框输入的解析结果：`keyword` 用于目录搜索，`market` 用于限定市场。 */
export interface InstrumentQuery {
  keyword: string
  market?: string
}

/**
 * 解析用户在搜索框或粘贴内容里输入的品种代码。
 *
 * TradingView 用 `<代码>.P` 表示永续；这里把该后缀还原成市场限定，避免把 `.P`
 * 当成代码的一部分发给后端。后缀大小写不敏感，不带后缀时不限定市场。
 * 精确匹配仍按完整展示代码比较，因此 `.P` 不会误伤名字本身以 `.P` 结尾的品种。
 * @param input 用户输入
 */
export function parseInstrumentQuery(input: string): InstrumentQuery {
  const trimmed = input.trim()
  if (trimmed.length <= PERPETUAL_CODE_SUFFIX.length) return { keyword: trimmed }
  if (!trimmed.toLowerCase().endsWith(PERPETUAL_CODE_SUFFIX.toLowerCase())) {
    return { keyword: trimmed }
  }
  return {
    keyword: trimmed.slice(0, trimmed.length - PERPETUAL_CODE_SUFFIX.length).trim(),
    market: PERPETUAL_MARKET,
  }
}
