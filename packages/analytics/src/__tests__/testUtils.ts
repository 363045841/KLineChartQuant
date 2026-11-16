/**
 * 测试公共工具：错误断言、合约构造器与临时目录。
 *
 * 用例只声明差异，公共构造集中在这里，避免每个用例各写一份替身数据。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { AnalyticsError, type AnalyticsErrorCode } from '../errors'
import type {
  OptionAggregateSnapshot,
  OptionContract,
  OptionCurrency,
  OptionExpirySummary,
  OptionLevelSet,
  OptionSkewUnavailableReason,
  OptionType,
  OptionVenue,
} from '../options/types'

/**
 * 断言调用抛出指定错误码的 AnalyticsError。
 *
 * @param run 被测调用
 * @param code 期望错误码
 * @returns 捕获到的错误，供继续断言字段
 */
export function expectAnalyticsError(run: () => unknown, code: AnalyticsErrorCode): AnalyticsError {
  try {
    run()
  } catch (error) {
    if (!(error instanceof AnalyticsError)) {
      throw error
    }
    expect(error.code).toBe(code)
    return error
  }
  throw new Error(`预期抛出 ${code}，但调用没有抛错`)
}

/** 合约构造参数：只给差异项，其余取默认值。 */
export interface ContractParams {
  /** 行权价 */
  readonly strike: number
  /** 方向 */
  readonly optionType: OptionType
  /** 未平仓量 */
  readonly openInterest: number
  /** 到期毫秒时间戳 */
  readonly expiryMs: number
  /** 到期日（UTC），默认由 expiryMs 推导 */
  readonly expiryIso?: string
  /** 隐含波动率百分数，默认 50 */
  readonly markIvPercent?: number
  /** 该到期日期货价，默认 100 */
  readonly forward?: number
  /** 标的，默认 BTC */
  readonly currency?: OptionCurrency
  /** 快照生成时刻，默认 2026-11-10T00:00:00Z */
  readonly creationTimestamp?: number
}

/**
 * 构造一张期权合约。
 *
 * @param params 差异项
 * @returns 合约对象
 */
export function makeContract(params: ContractParams): OptionContract {
  const currency = params.currency ?? 'BTC'
  const expiryIso = params.expiryIso ?? new Date(params.expiryMs).toISOString().slice(0, 10)
  return {
    instrumentName: `${currency}-TEST-${params.strike}-${params.optionType === 'call' ? 'C' : 'P'}`,
    currency,
    expiryIso,
    expiryMs: params.expiryMs,
    strike: params.strike,
    optionType: params.optionType,
    openInterest: params.openInterest,
    markIvPercent: params.markIvPercent ?? 50,
    markPrice: 0.01,
    underlyingPrice: params.forward ?? 100,
    creationTimestamp: params.creationTimestamp ?? Date.UTC(2026, 10, 10, 0, 0, 0),
  }
}

/**
 * 创建测试用临时目录。
 *
 * @param prefix 目录前缀
 * @returns 临时目录绝对路径
 */
export function createTempDir(prefix = 'kcq-analytics-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/**
 * 删除测试用临时目录。
 *
 * @param path 目录路径
 */
export function removeTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true })
}

/** 快照行构造参数：只给差异项。 */
export interface SnapshotParams {
  /** 采集时刻（毫秒） */
  readonly capturedAt: number
  /** 现货指数，默认 100 */
  readonly spotIndex?: number
  /** 近月平值 IV 百分数，默认 50 */
  readonly atmIvPercent?: number
  /** 标的，默认 BTC */
  readonly currency?: OptionCurrency
  /** 数据场所，默认 deribit（与 BTC/ETH 的场所一致） */
  readonly venue?: OptionVenue
  /** 逐到期汇总，默认空数组 */
  readonly expiries?: readonly OptionExpirySummary[]
  /** 25Δ 风险逆转；默认 null */
  readonly skew25dVolPoints?: number | null
  /** 偏斜使用的到期日；默认 null */
  readonly skew25dExpiryIso?: string | null
  /** 偏斜不可用原因；默认 null（与「没有偏斜值」一致时由用例显式给） */
  readonly skew25dReason?: OptionSkewUnavailableReason | null
}

/**
 * 构造一套空的关键位；用例只关心波动字段时用它兜底。
 *
 * @returns 关键位
 */
function emptyLevelSet(): OptionLevelSet {
  return {
    gammaFlipUsd: null,
    callWall: null,
    putWall: null,
    callGammaWall: null,
    putGammaWall: null,
    maxPainUsd: 0,
    netGexUsdPerPercent: 0,
    putCallOiRatio: null,
    totalOpenInterest: 0,
    contractCount: 0,
  }
}

/**
 * 构造一行期权聚合位快照。
 *
 * @param params 差异项
 * @returns 快照行
 */
export function makeSnapshotRow(params: SnapshotParams): OptionAggregateSnapshot {
  const spot = params.spotIndex ?? 100
  const atmIv = params.atmIvPercent ?? 50
  return {
    schemaVersion: 3,
    currency: params.currency ?? 'BTC',
    venue: params.venue ?? 'deribit',
    capturedAt: params.capturedAt,
    sourceTimestamp: params.capturedAt,
    spotIndex: spot,
    chainContractCount: 0,
    filteredContractCount: 0,
    nearTerm: {
      ...emptyLevelSet(),
      expiryIso: '2026-11-20',
      dteDays: 4,
      atmIvPercent: atmIv,
      expectedMoveOneSigmaUsd: 1,
      expectedMoveTwoSigmaUsd: 2,
      sigmaLowerUsd: spot - 1,
      sigmaUpperUsd: spot + 1,
      sigma2LowerUsd: spot - 2,
      sigma2UpperUsd: spot + 2,
    },
    allChain: emptyLevelSet(),
    gammaFlip: { gammaFlipUsd: null, source: 'all-chain' },
    expiries: params.expiries ?? [],
    skew25dVolPoints: params.skew25dVolPoints ?? null,
    skew25dExpiryIso: params.skew25dExpiryIso ?? null,
    skew25dReason: params.skew25dReason ?? null,
  }
}
