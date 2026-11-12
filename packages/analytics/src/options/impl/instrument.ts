/**
 * Deribit 合约名解析。
 *
 * 合约名格式固定为 `{CUR}-{DD}{MON}{YY}-{STRIKE}-{C|P}`，例如
 * `BTC-27NOV26-73000-C` 表示 BTC、2026-11-27 08:00 UTC 到期、行权价 73000 的看涨期权。
 * 到期时刻实测固定为 08:00 UTC，链上 876 张合约全部符合该格式。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { OptionCurrency, OptionType } from '../types'

/** 月份英文缩写 → 0 基月份序号。 */
const MONTH_BY_CODE: Readonly<Record<string, number>> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
}

/** Deribit 合约到期时刻：UTC 08:00。 */
const EXPIRY_HOUR_UTC = 8

/** 合约名正则。 */
const INSTRUMENT_NAME_PATTERN = /^(BTC|ETH)-(\d{1,2})([A-Z]{3})(\d{2})-(\d+)-([CP])$/

/** 解析结果。 */
export interface ParsedInstrumentName {
  /** 原始合约名 */
  readonly instrumentName: string
  /** 标的 */
  readonly currency: OptionCurrency
  /** 到期时刻毫秒时间戳 */
  readonly expiryMs: number
  /** 到期日（UTC 日期） */
  readonly expiryIso: string
  /** 行权价 */
  readonly strike: number
  /** 方向 */
  readonly optionType: OptionType
}

/**
 * 解析 Deribit 合约名。
 *
 * @param instrumentName 合约名
 * @returns 标的、到期时刻、行权价与方向
 * @throws AnalyticsError 格式不匹配或日期非法
 */
export function parseInstrumentName(instrumentName: string): ParsedInstrumentName {
  const matched = INSTRUMENT_NAME_PATTERN.exec(instrumentName)
  if (matched === null) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.INSTRUMENT_UNPARSEABLE,
      `无法解析合约名：${instrumentName}`,
      { instrumentName },
    )
  }

  const currencyRaw = matched[1]
  if (currencyRaw !== 'BTC' && currencyRaw !== 'ETH') {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.INSTRUMENT_UNPARSEABLE,
      `合约名标的非法：${instrumentName}`,
      { instrumentName, currencyRaw },
    )
  }
  const currency: OptionCurrency = currencyRaw
  const day = Number(matched[2])
  const monthCode = matched[3]
  const month = MONTH_BY_CODE[monthCode]
  const year = 2000 + Number(matched[4])
  const strike = Number(matched[5])
  const optionType: OptionType = matched[6] === 'C' ? 'call' : 'put'

  if (month === undefined) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.INSTRUMENT_UNPARSEABLE,
      `合约名月份非法：${instrumentName}`,
      { instrumentName, monthCode },
    )
  }

  const expiryMs = Date.UTC(year, month, day, EXPIRY_HOUR_UTC, 0, 0)
  const expiry = new Date(expiryMs)
  const dateMatches =
    expiry.getUTCFullYear() === year &&
    expiry.getUTCMonth() === month &&
    expiry.getUTCDate() === day
  if (!dateMatches || !(strike > 0)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.INSTRUMENT_UNPARSEABLE,
      `合约名日期或行权价非法：${instrumentName}`,
      { instrumentName, strike },
    )
  }

  return {
    instrumentName,
    currency,
    expiryMs,
    expiryIso: expiry.toISOString().slice(0, 10),
    strike,
    optionType,
  }
}
