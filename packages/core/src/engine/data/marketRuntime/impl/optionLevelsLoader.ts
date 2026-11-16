/**
 * 期权关键位取数：从 analytics 只读服务读取快照，供指标脚本使用。
 *
 * 服务不可用或返回异常时一律返回空数组：期权数据是可选输入，
 * 取不到时脚本按「没有数据」处理，不能因此让指标计算失败。
 */
import type { OptionLevelsRequest, OptionLevelsRow } from '@363045841yyt/klinechart-plot-contracts'

/** analytics 只读服务地址；与桌面端 `analytics serve` 的默认端口一致。 */
const SERVICE_BASE = 'http://127.0.0.1:8093'

/** 同一标的的缓存有效期：采集每 60 秒一轮，缓存也按 60 秒。 */
const CACHE_TTL_MS = 60_000

/** 一次最多取多少条快照。 */
const MAX_ROWS = 5_000

interface CacheEntry {
  readonly at: number
  readonly rows: readonly OptionLevelsRow[]
}

/** 按标的缓存，避免同一帧内多个指标重复请求。 */
const cache = new Map<string, CacheEntry>()

/** 从原始记录里读数值；缺失或非数字返回 null。 */
function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 从原始记录里读必填数值；缺失时抛错由上层降级为空结果。 */
function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = readNumber(source, key)
  if (value === null) throw new Error(`期权记录缺少字段 ${key}`)
  return value
}

/** 读嵌套对象里的数值。 */
function nestedNumber(source: Record<string, unknown>, group: string, key: string): number | null {
  const block = source[group]
  if (typeof block !== 'object' || block === null) return null
  return readNumber(block as Record<string, unknown>, key)
}

/** 读墙位行权价；墙位为 null 时返回 null。 */
function wallStrike(source: Record<string, unknown>, group: string, key: string): number | null {
  const block = source[group]
  if (typeof block !== 'object' || block === null) return null
  return nestedStrike(block as Record<string, unknown>, key)
}

/** 从墙位对象里取 strike。 */
function nestedStrike(wall: Record<string, unknown>, key: string): number | null {
  const nested = wall[key]
  if (typeof nested !== 'object' || nested === null) return null
  return readNumber(nested as Record<string, unknown>, 'strike')
}

/** 把 analytics 的聚合记录转成脚本可见的一行。 */
function toRow(record: Record<string, unknown>): OptionLevelsRow | null {
  // 只认带 nearTerm 与 allChain 的行（schema 2 起）：schema 1 的扁平行直接跳过。
  if (!isRecord(record.nearTerm) || !isRecord(record.allChain)) return null
  const gammaFlip = record.gammaFlip
  const source =
    typeof gammaFlip === 'object' &&
    gammaFlip !== null &&
    (gammaFlip as Record<string, unknown>).source === 'all-chain'
      ? 'all-chain'
      : 'near-term'
  return {
    capturedAt: requireNumber(record, 'capturedAt'),
    nearTermExpiryIso: String(
      record[`nearTermExpiryIso`] ?? nestedText(record, 'nearTerm', 'expiryIso'),
    ),
    nearTermDteDays: nestedNumber(record, 'nearTerm', 'dteDays') ?? 0,
    atmIvPercent: nestedNumber(record, 'nearTerm', 'atmIvPercent'),
    spotIndex: requireNumber(record, 'spotIndex'),
    gammaFlipUsd:
      nestedNumber(record, 'nearTerm', 'gammaFlipUsd') ??
      nestedNumber(record, 'allChain', 'gammaFlipUsd'),
    gammaFlipSource: source,
    callWallUsd: wallStrike(record, 'nearTerm', 'callWall'),
    putWallUsd: wallStrike(record, 'nearTerm', 'putWall'),
    callGammaWallUsd: wallStrike(record, 'nearTerm', 'callGammaWall'),
    putGammaWallUsd: wallStrike(record, 'nearTerm', 'putGammaWall'),
    maxPainUsd: nestedNumber(record, 'nearTerm', 'maxPainUsd') ?? Number.NaN,
    sigmaLowerUsd: nestedNumber(record, 'nearTerm', 'sigmaLowerUsd') ?? Number.NaN,
    sigmaUpperUsd: nestedNumber(record, 'nearTerm', 'sigmaUpperUsd') ?? Number.NaN,
    sigma2LowerUsd: nestedNumber(record, 'nearTerm', 'sigma2LowerUsd') ?? Number.NaN,
    sigma2UpperUsd: nestedNumber(record, 'nearTerm', 'sigma2UpperUsd') ?? Number.NaN,
    allChainGammaFlipUsd: nestedNumber(record, 'allChain', 'gammaFlipUsd'),
    allChainCallWallUsd: wallStrike(record, 'allChain', 'callWall'),
    allChainPutWallUsd: wallStrike(record, 'allChain', 'putWall'),
    allChainMaxPainUsd: nestedNumber(record, 'allChain', 'maxPainUsd') ?? Number.NaN,
    putCallOiRatio: nestedNumber(record, 'nearTerm', 'putCallOiRatio'),
    allChainPutCallOiRatio: nestedNumber(record, 'allChain', 'putCallOiRatio'),
  }
}

/** 读嵌套对象里的字符串。 */
function nestedText(source: Record<string, unknown>, group: string, key: string): string {
  const block = source[group]
  if (typeof block !== 'object' || block === null) return ''
  const value = (block as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

/**
 * 读某标的的期权关键位快照，按采集时刻升序。
 *
 * @param request 标的与历史条数
 * @param signal 取消信号
 * @returns 快照数组；服务不可用、响应非法或全部是旧版本记录时返回空数组
 */
export async function loadOptionLevels(
  request: OptionLevelsRequest,
  signal?: AbortSignal,
): Promise<readonly OptionLevelsRow[]> {
  const limit = Math.min(request.historyLimit ?? 1, MAX_ROWS)
  const cached = cache.get(request.underlying)
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.rows.slice(Math.max(0, cached.rows.length - limit))
  }

  const url = `${SERVICE_BASE}/options/series?currency=${encodeURIComponent(request.underlying)}&limit=${MAX_ROWS}`
  let rows: readonly OptionLevelsRow[]
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return []
    const payload: unknown = await response.json()
    const raw = isRecord(payload) ? payload.rows : undefined
    if (!Array.isArray(raw)) return []
    rows = raw
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .map(toRow)
      .filter((row): row is OptionLevelsRow => row !== null)
  } catch {
    return []
  }
  cache.set(request.underlying, { at: Date.now(), rows })
  return rows.slice(Math.max(0, rows.length - limit))
}

/** 判断是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 清空缓存；品种或数据源切换时由上层调用。 */
export function resetOptionLevelsCache(): void {
  cache.clear()
}
