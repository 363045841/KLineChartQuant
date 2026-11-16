/**
 * 期权分片的保留期清理。
 *
 * 每层各自一段保留期：原始链 90 天（研究价值低、体积大），分钟行与小时行 365 天，
 * 日行 3650 天。清理是纯删除，不做归档；需要归档时由备份承担。
 */
import type { DayShardStore } from '../../storage/types'
import {
  OPTION_CHAIN_RETENTION_DAYS,
  OPTION_DAILY_RETENTION_DAYS,
  OPTION_HOURLY_RETENTION_DAYS,
  OPTION_MINUTE_RETENTION_DAYS,
} from '../types'
import { type OptionLayer, optionChainStream, optionLayerStream } from './streams'

/** 一天的毫秒数。 */
const DAY_MS = 86_400_000

/** 各层的保留天数。 */
const LAYER_RETENTION_DAYS: Readonly<Record<OptionLayer, number>> = {
  minute: OPTION_MINUTE_RETENTION_DAYS,
  hourly: OPTION_HOURLY_RETENTION_DAYS,
  daily: OPTION_DAILY_RETENTION_DAYS,
}

/** 一条流被删掉的日期。 */
export interface OptionPurgeResult {
  /** 流标识 */
  readonly stream: string
  /** 保留期天数 */
  readonly retentionDays: number
  /** 被删除的日期（升序） */
  readonly days: readonly string[]
}

/** 清理请求。 */
export interface OptionPurgeRequest {
  /** 分片存储 */
  readonly store: DayShardStore
  /** 标的列表 */
  readonly currencies: readonly string[]
  /** 时钟（毫秒），测试可注入 */
  readonly now: () => number
}

/**
 * 取保留截止日：该日之前的分片会被删除。
 *
 * @param nowMs 当前毫秒
 * @param days 保留天数
 * @returns `YYYY-MM-DD`
 */
export function retentionCutoffDay(nowMs: number, days: number): string {
  return new Date(nowMs - days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * 按各层保留期清理分片。
 *
 * @param request 存储、标的与时钟
 * @returns 每条流的删除结果；没有过期分片时该条目的 days 为空
 */
export function purgeOptionStreams(request: OptionPurgeRequest): readonly OptionPurgeResult[] {
  const nowMs = request.now()
  const results: OptionPurgeResult[] = []
  for (const currency of request.currencies) {
    const targets: readonly { stream: string; retentionDays: number }[] = [
      { stream: optionChainStream(currency), retentionDays: OPTION_CHAIN_RETENTION_DAYS },
      ...(['minute', 'hourly', 'daily'] as const).map((layer) => ({
        stream: optionLayerStream(currency, layer),
        retentionDays: LAYER_RETENTION_DAYS[layer],
      })),
    ]
    for (const target of targets) {
      const beforeDay = retentionCutoffDay(nowMs, target.retentionDays)
      const days = request.store.purgeBefore({ stream: target.stream, beforeDay })
      results.push({ stream: target.stream, retentionDays: target.retentionDays, days })
    }
  }
  return results
}
