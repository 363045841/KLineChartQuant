/**
 * ChartDataManager.getTimestampAtLogicalIndex 越界外推测试。
 *
 * 数据区内行为不变；越界槽位按主品种交易日历外推：
 * session 未注入、数据不足（<2 根）时保持旧 null 语义。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FOREX_MARKET_SESSION } from '../../market/forexMarketSession'
import type { ChartDataManager } from '../chartDataManager'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  MS_PER_DAY,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

/** 2026-01-02 22:00 UTC：FOREX 画像下的周五末根日线；前一根为周四。 */
const FRIDAY_TS = Date.UTC(2026, 0, 2, 22, 0, 0)

/** 第 i 根日线时间戳：夹具 5 根为周一至周五，末根（i=4）为周五。 */
function barTs(i: number): number {
  return FRIDAY_TS + (i - 4) * MS_PER_DAY
}

describe('ChartDataManager 未来槽位时间外推', () => {
  let manager: ChartDataManager | null = null
  let document: Document

  beforeEach(() => {
    document = createTestDocument()
  })

  afterEach(() => {
    manager?.destroy()
    manager = null
    unregisterTestProvider()
    vi.unstubAllGlobals()
  })

  /** 注册日线 Provider 并加载：默认 5 根（周一至周五），用例只声明差异。 */
  async function loadDailyBars(
    options: {
      futureSession?: () => typeof FOREX_MARKET_SESSION
      bars?: ReturnType<typeof makeKLine>[]
    } = {},
  ): Promise<void> {
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            return makeBarsPage(
              options.bars ?? Array.from({ length: 5 }, (_, i) => makeKLine(barTs(i))),
            )
          },
        },
      }),
    )
    const harness = createTestChartDataManager(
      document,
      options.futureSession ? { futureSession: options.futureSession } : {},
    )
    manager = harness.manager
    manager!.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
  }

  it('越界槽位按交易日历外推：周五后为下周一、周二', async () => {
    await loadDailyBars({ futureSession: () => FOREX_MARKET_SESSION })

    // steps=1：周五 22:00 + 1day 落周六 → 跳下周一 22:00（UTC 画像，精确值无漂移）
    expect(manager!.getTimestampAtLogicalIndex(5)).toBe(Date.UTC(2026, 0, 5, 22))
    // steps=2：下周一 → 下周二
    expect(manager!.getTimestampAtLogicalIndex(6)).toBe(Date.UTC(2026, 0, 6, 22))
  })

  it('数据区内索引仍返回真实 timestamp，不触发外推', async () => {
    await loadDailyBars({ futureSession: () => FOREX_MARKET_SESSION })

    for (let i = 0; i < 5; i++) {
      expect(manager!.getTimestampAtLogicalIndex(i)).toBe(barTs(i))
    }
  })

  it('负索引返回 null', async () => {
    await loadDailyBars({ futureSession: () => FOREX_MARKET_SESSION })

    expect(manager!.getTimestampAtLogicalIndex(-1)).toBeNull()
  })

  it('futureSession 未注入时越界返回 null（旧行为）', async () => {
    await loadDailyBars()

    expect(manager!.getTimestampAtLogicalIndex(5)).toBeNull()
  })

  it('数据不足（<2 根）时越界返回 null', async () => {
    await loadDailyBars({ futureSession: () => FOREX_MARKET_SESSION, bars: [makeKLine(FRIDAY_TS)] })

    expect(manager!.getTimestampAtLogicalIndex(1)).toBeNull()
  })
})
