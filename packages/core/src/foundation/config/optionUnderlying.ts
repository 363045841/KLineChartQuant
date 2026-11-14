/**
 * 品种到期权标的的映射。
 *
 * 图表上交易员看的代码（`BTCUSDT`）和期权数据里的标的（`BTC`）不是同一套命名，
 * 两者由这张表连接。映射放在配置层、脚本只读映射结果，是为了新增品种时只改这里一行，
 * 已有指标脚本一律不动。没有映射的品种不猜：宿主取不到数据，脚本按「没有期权数据」处理。
 */

/**
 * 期权标的映射表。
 *
 * 键是不带 `.P` 的画图代码；`.P` 只是永续的展示后缀，见 `formatInstrumentLabel`。
 */
const OPTION_UNDERLYING_BY_SYMBOL: ReadonlyMap<string, string> = new Map([
  /** 币安 BTC 永续 / 现货 → Deribit BTC 期权 */
  ['BTCUSDT', 'BTC'],
  /** 币安 ETH 永续 / 现货 → Deribit ETH 期权 */
  ['ETHUSDT', 'ETH'],
  /** 黄金：目前没有原生期权源；接入 GLD ETF 代理后把右侧改成 GLD，脚本不用动。 */
  ['XAUUSD', 'XAUUSD'],
])

/**
 * 解析图表品种对应的期权标的。
 *
 * 接受裸代码或带 `.P` 后的永续代码，大小写不敏感；其它写法不猜。
 *
 * @param symbol 图表品种代码，例如 `BTCUSDT` 或 `BTCUSDT.P`
 * @returns 期权标的，例如 `BTC`；没有映射时返回 null
 */
export function resolveOptionUnderlying(symbol: string): string | null {
  const code = symbol.trim().toUpperCase()
  const bare = code.endsWith('.P') ? code.slice(0, -'.P'.length) : code
  if (bare === '') return null
  return OPTION_UNDERLYING_BY_SYMBOL.get(bare) ?? null
}
