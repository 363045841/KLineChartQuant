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
import type { OptionContract, OptionCurrency, OptionType } from '../options/types'

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
