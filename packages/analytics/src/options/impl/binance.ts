/**
 * Binance 欧式期权（EAPI）适配器：只服务注册表里登记为 Binance 的标的（SOL / BNB / XRP）。
 *
 * 与 Deribit 的差别都收在这里：
 * - 没有「每个到期的期货价」，只能用现货指数近似远期价格（短期限误差小，期限越长越明显）。
 * - 数字多以字符串返回（markIV / indexPrice / sumOpenInterest），统一用 readNumberLike 解析。
 * - 持仓量按张数返回，乘上 exchangeInfo 的 `unit` 折成标的数量，与 Deribit 的口径对齐。
 * - 到期日集中在 10 天以内：alt 期权没有月度合约，期限结构与 30 天偏斜按实际到期取。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { HttpClient, ProxyEndpoint } from '../../net/types'
import { optionMarketOf } from '../markets'
import type {
  OptionChainSnapshot,
  OptionContract,
  OptionCurrency,
  OptionVenueSource,
  SpotIndexSnapshot,
} from '../types'
import { isRecord, parseJsonBody, readNumberLike, readText } from './httpJson'

/** Binance 期权 REST 基址。 */
export const BINANCE_OPTIONS_API_BASE = 'https://eapi.binance.com'

/** 默认超时：全链 exchangeInfo 约 1.2 MB，15 秒足够暴露网络问题。 */
export const DEFAULT_BINANCE_OPTIONS_TIMEOUT_MS = 15_000

/**
 * exchangeInfo 的缓存时长。
 *
 * 合约清单每天只增删几次，5 分钟足够新；1.2 MB 的响应经代理每次要几秒，
 * 三个标的各拉一次会把 60 秒的采集周期吃掉一半。
 */
const EXCHANGE_INFO_TTL_MS = 5 * 60_000

/** mark 的缓存时长：同一轮采集内各标的共用一份，跨轮必须重取。 */
const MARK_TTL_MS = 30_000

/** 客户端构造参数。 */
export interface BinanceOptionsClientOptions {
  /** HTTP 客户端（真实实现或测试替身） */
  readonly httpClient: HttpClient
  /** 代理端点；本机直连 Binance 会被拦，由调用方显式传入 */
  readonly proxy: ProxyEndpoint | null
  /** 单次请求超时，默认 15 秒 */
  readonly timeoutMs?: number
  /** 时钟毫秒，测试可注入；合约没有链上时间戳，用采集时刻代替 */
  readonly now?: () => number
}

/** 一次请求的文本结果。 */
interface FetchedJson {
  /** 解析后的任意值 */
  readonly value: unknown
  /** 请求耗时（毫秒） */
  readonly elapsedMs: number
}

/**
 * 取 Binance 的场内写法；标的未登记或登记的场所不是 Binance 时直接报错。
 *
 * @param currency 统一标的代码
 * @returns 场内写法（SOLUSDT）
 * @throws AnalyticsError 标的未登记或场所不符
 */
function binanceUnderlyingOf(currency: OptionCurrency): string {
  const market = optionMarketOf(currency)
  if (market === null || market.venue !== 'binance') {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `Binance 没有该标的的期权：${currency}`,
      { currency },
    )
  }
  return market.venueSymbol
}

/**
 * 把到期毫秒转成 Binance openInterest 接口要的 `YYMMDD`。
 *
 * @param expiryMs 到期毫秒时间戳
 * @returns 六位日期串
 */
function expirationCodeOf(expiryMs: number): string {
  const date = new Date(expiryMs)
  const year = String(date.getUTCFullYear()).slice(2)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * 把 mark 行按合约名索引。
 *
 * @param rows mark 行
 * @returns 合约名到 mark 行的映射
 */
function indexMarks(
  rows: readonly Record<string, unknown>[],
): ReadonlyMap<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const symbol = row.symbol
    if (typeof symbol === 'string') map.set(symbol, row)
  }
  return map
}

/**
 * 创建 Binance 期权数据源。
 *
 * @param options HTTP 客户端、代理、超时与时钟
 * @returns 期权链与指数价拉取接口
 */
export function createBinanceOptionsClient(
  options: BinanceOptionsClientOptions,
): OptionVenueSource {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BINANCE_OPTIONS_TIMEOUT_MS
  const now = options.now ?? Date.now

  /** 全链合约清单的缓存；TTL 内复用，过期重取。 */
  let exchangeInfoCache: { at: number; symbols: readonly Record<string, unknown>[] } | null = null

  /** mark 快照的缓存；同一轮采集里各标的共用。 */
  let markCache: { at: number; rows: readonly Record<string, unknown>[] } | null = null

  /**
   * 取一次 JSON。
   *
   * @param path 以 / 开头的路径
   * @returns 解析后的值与耗时
   */
  async function getJson(path: string): Promise<FetchedJson> {
    const url = `${BINANCE_OPTIONS_API_BASE}${path}`
    const response = await options.httpClient.getText({ url, timeoutMs, proxy: options.proxy })
    return { value: parseJsonBody(response.body, url), elapsedMs: response.elapsedMs }
  }

  /**
   * 读交易所的全部期权符号清单，带 TTL 缓存。
   *
   * @returns 全部符号定义与本次耗时（命中缓存时为 0）
   */
  async function readExchangeInfoCatalog(): Promise<{
    symbols: readonly Record<string, unknown>[]
    elapsedMs: number
  }> {
    const cached = exchangeInfoCache
    if (cached !== null && now() - cached.at < EXCHANGE_INFO_TTL_MS) {
      return { symbols: cached.symbols, elapsedMs: 0 }
    }
    const fetched = await getJson('/eapi/v1/exchangeInfo')
    const shell = isRecord(fetched.value) ? fetched.value.optionSymbols : undefined
    if (!Array.isArray(shell)) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
        'Binance exchangeInfo 缺少 optionSymbols 数组',
      )
    }
    const symbols = shell.filter((item): item is Record<string, unknown> => isRecord(item))
    exchangeInfoCache = { at: now(), symbols }
    return { symbols, elapsedMs: fetched.elapsedMs }
  }

  /**
   * 读全部合约的 mark 快照，带 TTL 缓存。
   *
   * @returns 按合约名索引的 mark 行与本次耗时
   */
  async function readMarks(): Promise<{
    markBySymbol: ReadonlyMap<string, Record<string, unknown>>
    elapsedMs: number
  }> {
    const cached = markCache
    if (cached !== null && now() - cached.at < MARK_TTL_MS) {
      return { markBySymbol: indexMarks(cached.rows), elapsedMs: 0 }
    }
    const fetched = await getJson('/eapi/v1/mark')
    const rows = Array.isArray(fetched.value)
      ? fetched.value.filter((row): row is Record<string, unknown> => isRecord(row))
      : []
    markCache = { at: now(), rows }
    return { markBySymbol: indexMarks(rows), elapsedMs: fetched.elapsedMs }
  }

  return {
    async getOptionChain(currency: OptionCurrency): Promise<OptionChainSnapshot> {
      const underlying = binanceUnderlyingOf(currency)
      const asset = underlying.replace(/USDT$/, '')
      const catalog = await readExchangeInfoCatalog()
      const infoSymbols = catalog.symbols.filter(
        (item) => item.underlying === underlying && item.status === 'TRADING',
      )
      if (infoSymbols.length === 0) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Binance 没有在交易的期权符号：${underlying}`,
          { underlying },
        )
      }

      const marks = await readMarks()
      const markBySymbol = marks.markBySymbol

      const index = await getJson(`/eapi/v1/index?underlying=${underlying}`)
      if (!isRecord(index.value)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Binance 指数响应不是对象：${underlying}`,
          { underlying },
        )
      }
      const indexPrice = readNumberLike(index.value, 'indexPrice', underlying)

      // 按到期分组：openInterest 接口按到期查，同一到期的合约共用一次请求。
      const expiries = new Set<number>()
      for (const symbol of infoSymbols) {
        expiries.add(readNumberLike(symbol, 'expiryDate', underlying))
      }
      const openInterestBySymbol = new Map<string, number>()
      let openInterestElapsedMs = 0
      for (const expiryMs of [...expiries].sort((left, right) => left - right)) {
        const fetched = await getJson(
          `/eapi/v1/openInterest?underlyingAsset=${asset}&expiration=${expirationCodeOf(expiryMs)}`,
        )
        openInterestElapsedMs += fetched.elapsedMs
        const rows = Array.isArray(fetched.value) ? fetched.value : []
        for (const row of rows) {
          if (!isRecord(row)) continue
          const symbol = row.symbol
          if (typeof symbol !== 'string') continue
          openInterestBySymbol.set(symbol, readNumberLike(row, 'sumOpenInterest', symbol))
        }
      }

      const nowMs = now()
      const contracts: OptionContract[] = infoSymbols.map((symbol) => {
        const name = readText(symbol, 'symbol', underlying)
        const expiryMs = readNumberLike(symbol, 'expiryDate', name)
        const side = readText(symbol, 'side', name)
        const unit = readNumberLike(symbol, 'unit', name)
        const mark = markBySymbol.get(name)
        if (mark === undefined) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Binance mark 缺少合约：${name}`,
            { symbol: name },
          )
        }
        return {
          instrumentName: name,
          currency,
          expiryIso: new Date(expiryMs).toISOString().slice(0, 10),
          expiryMs,
          strike: readNumberLike(symbol, 'strikePrice', name),
          optionType: side === 'CALL' ? 'call' : 'put',
          // 张数 × 每张标的数量：与 Deribit 一样用「标的数量」口径，墙位与 GEX 才可比。
          openInterest: (openInterestBySymbol.get(name) ?? 0) * unit,
          markIvPercent: readNumberLike(mark, 'markIV', name) * 100,
          markPrice: readNumberLike(mark, 'markPrice', name),
          // 没有每个到期的期货价，用现货指数近似远期价格。
          underlyingPrice: indexPrice,
          creationTimestamp: nowMs,
        }
      })

      const elapsedMs =
        catalog.elapsedMs + marks.elapsedMs + index.elapsedMs + openInterestElapsedMs
      return { contracts, elapsedMs }
    },

    async getIndexPrice(currency: OptionCurrency): Promise<SpotIndexSnapshot> {
      const underlying = binanceUnderlyingOf(currency)
      const fetched = await getJson(`/eapi/v1/index?underlying=${underlying}`)
      const payload = fetched.value
      if (!isRecord(payload)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Binance 指数响应不是对象：${underlying}`,
          { underlying },
        )
      }
      return {
        indexPrice: readNumberLike(payload, 'indexPrice', underlying),
        elapsedMs: fetched.elapsedMs,
      }
    },
  }
}
