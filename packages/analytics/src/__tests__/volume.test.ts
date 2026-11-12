/**
 * 币安 K 线买卖量拆分与采集单元测试。
 *
 * 覆盖：第 9/10 字段取值、守恒断言、非法元组、周期校验、落盘与幂等。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { ANALYTICS_ERROR_CODES } from '../errors'
import { createDayShardStore } from '../storage/impl/dayShardStore'
import { createBinanceClient, parseVolumeInterval, splitKline } from '../volume/impl/binance'
import { collectVolumeSeries } from '../volume/impl/collect'
import type { BinanceClient, VolumeBarRecord } from '../volume/types'
import { createTempDir, expectAnalyticsError, removeTempDir } from './testUtils'

/** 一根合法的币安 K 线元组（字段与真实响应同形，数字为字符串）。 */
const VALID_KLINE: readonly unknown[] = [
  1_794_240_000_000,
  '100',
  '101',
  '99',
  '100.5',
  '10',
  1_794_243_599_999,
  '1005',
  7,
  '4',
  '402',
  '0',
]

describe('splitKline', () => {
  it('从第 9/10 字段取主动买量并算出主动卖量', () => {
    const bar = splitKline(VALID_KLINE, 'BTCUSDT')
    expect(bar.openTime).toBe(1_794_240_000_000)
    expect(bar.baseVolume).toBe(10)
    expect(bar.takerBuyBaseVolume).toBe(4)
    expect(bar.takerSellBaseVolume).toBe(6)
    expect(bar.quoteVolume).toBe(1005)
    expect(bar.takerBuyQuoteVolume).toBe(402)
    expect(bar.takerSellQuoteVolume).toBe(603)
    expect(bar.trades).toBe(7)
  })

  it('买量大于总量时守恒断言失败', () => {
    const broken = [...VALID_KLINE]
    broken[9] = '12'
    expectAnalyticsError(
      () => splitKline(broken, 'BTCUSDT'),
      ANALYTICS_ERROR_CODES.VOLUME_SPLIT_MISMATCH,
    )
  })

  it('缺少第 11 个字段时抛结构错误', () => {
    expectAnalyticsError(
      () => splitKline(VALID_KLINE.slice(0, 9), 'BTCUSDT'),
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
    )
  })

  it('字段不是数字时抛结构错误', () => {
    const broken = [...VALID_KLINE]
    broken[5] = 'abc'
    expectAnalyticsError(
      () => splitKline(broken, 'BTCUSDT'),
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
    )
  })
})

describe('parseVolumeInterval', () => {
  it('接受受支持的周期', () => {
    expect(parseVolumeInterval('1m')).toBe('1m')
    expect(parseVolumeInterval('1d')).toBe('1d')
  })

  it('拒绝未知周期', () => {
    expectAnalyticsError(() => parseVolumeInterval('7m'), ANALYTICS_ERROR_CODES.ARGUMENT_INVALID)
  })
})

describe('collectVolumeSeries', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      removeTempDir(dir)
    }
  })

  /** 固定返回一根 K 线的替身客户端。 */
  function createFakeClient(): BinanceClient {
    return {
      getKlines: async (request) => ({
        bars: [splitKline(VALID_KLINE, request.symbol)],
        elapsedMs: 1,
      }),
    }
  }

  it('落盘后读回一致，重复采集不产生重复行', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)
    const request = {
      client: createFakeClient(),
      store,
      symbols: ['BTCUSDT'],
      intervals: ['1m'] as const,
      limit: 1,
      // 时钟晚于样本 closeTime，样本才会被当作已收盘 K 线落盘。
      now: () => 1_794_243_600_000,
    }

    const first = await collectVolumeSeries(request)
    expect(first).toHaveLength(1)
    expect(first[0].readBackVerified).toBe(true)
    expect(first[0].appends.reduce((sum, append) => sum + append.appended, 0)).toBe(1)

    const stored = store.read<VolumeBarRecord>({
      stream: 'volume/BTCUSDT/1m',
      day: '2026-11-09',
    })
    expect(stored).toHaveLength(1)
    expect(stored[0].takerBuyBaseVolume).toBe(4)
    expect(stored[0].takerSellBaseVolume).toBe(6)

    const second = await collectVolumeSeries(request)
    expect(second[0].appends.reduce((sum, append) => sum + append.appended, 0)).toBe(0)
    expect(
      store.read<VolumeBarRecord>({ stream: 'volume/BTCUSDT/1m', day: '2026-11-09' }),
    ).toHaveLength(1)
  })

  it('未收盘的最后一根 K 线不落盘', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)

    const closedBar = [...VALID_KLINE]
    const openBar = [...VALID_KLINE]
    openBar[0] = 1_794_243_600_000
    openBar[6] = 1_794_243_659_999

    const client: BinanceClient = {
      getKlines: async (request) => ({
        bars: [splitKline(closedBar, request.symbol), splitKline(openBar, request.symbol)],
        elapsedMs: 1,
      }),
    }

    const results = await collectVolumeSeries({
      client,
      store,
      symbols: ['BTCUSDT'],
      intervals: ['1m'],
      limit: 2,
      now: () => 1_794_243_610_000,
    })

    expect(results[0].barCount).toBe(1)
    expect(
      store.read<VolumeBarRecord>({ stream: 'volume/BTCUSDT/1m', day: '2026-11-09' }),
    ).toHaveLength(1)
  })

  it('客户端返回非法 K 线时报错而不是写入脏数据', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)
    const brokenClient = createBinanceClient({
      httpClient: {
        getText: async () => ({
          status: 200,
          body: JSON.stringify([
            [1_794_240_000_000, '1', '1', '1', '1', '10', 1, '10', 1, '12', '1', '0'],
          ]),
          elapsedMs: 1,
        }),
        // 本用例只走 GET；POST 分支由深度采集器使用，这里显式拒绝以免误用。
        postJson: async () => {
          throw new Error('本替身不支持 POST')
        },
      },
      proxy: null,
    })

    await expect(
      collectVolumeSeries({
        client: brokenClient,
        store,
        symbols: ['BTCUSDT'],
        intervals: ['1m'],
        limit: 1,
        now: () => 1_794_243_600_000,
      }),
    ).rejects.toThrowError('买卖量拆分不守恒')
  })
})
