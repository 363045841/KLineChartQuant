/** 验证成交唯一入口在分帧、断线、补载、回收与取消下保持完整性和成交总量。 */
import { describe, expect, it, vi } from 'vitest'
import { createFootprintCalculator } from '../../../components/footprint/impl/calculateFootprint.js'
import { FOOTPRINT_METRICS } from '../../../components/footprint/types.js'
import { missingTradeRanges } from '../impl/tradeRanges.js'
import type { TradeBatch } from '../types.js'
import {
  createTradeCache,
  marketTrade,
  tradeInstrument,
  tradeSelection,
} from './helpers/tradeTestKit.js'

describe('Unified trade loading', () => {
  // 相同毫秒成交分帧到达，历史与实时任意先后都应与纯历史计算一致。
  it.each(['history-first', 'live-first'])(
    'preserves same-millisecond trades with %s',
    async (order) => {
      const records = [
        marketTrade('1', 120_000),
        marketTrade('2', 120_000, '100.02'),
        marketTrade('3', 120_500),
      ]
      const f = createTradeCache(records)
      try {
        if (order === 'history-first') await f.query({ from: 60_000, to: 120_501 })
        f.emit([records[0]!])
        f.emit([records[1]!])
        f.emit([records[2]!])
        await f.query({ from: 60_000, to: 120_501 })
        const snapshot = f.buffer.snapshot.peek()
        expect(
          snapshot.batches
            .flatMap((batch) => batch.items)
            .map((trade) => trade.tradeId)
            .sort(),
        ).toEqual(['1', '2', '3'])
        const bars = [60_000, 120_000].map((timestamp) => ({
          timestamp,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
        }))
        const params = { ticksPerRow: 1, imbalanceRatio: 3, metric: FOOTPRINT_METRICS.Volume }
        const reference = createTradeCache(records)
        try {
          await reference.query({ from: 60_000, to: 120_501 })
          const actual = createFootprintCalculator()(bars, params, {
            ...snapshot,
            status: 'ready',
            message: null,
          })
          const expected = createFootprintCalculator()(
            bars,
            params,
            reference.cache.getTradeSnapshot(tradeSelection, reference.buffer),
          )
          expect(
            actual.bars.map(
              (bar) => bar && { cells: bar.cells, total: bar.total, delta: bar.delta },
            ),
          ).toEqual(
            expected.bars.map(
              (bar) => bar && { cells: bar.cells, total: bar.total, delta: bar.delta },
            ),
          )
        } finally {
          reference.cache.destroy()
        }
      } finally {
        f.cache.destroy()
      }
    },
  )

  // 一帧内跳号不能用首尾时间填平几分钟的缺口；历史必须补回缺失身份。
  it('repairs an ID gap inside a frame without declaring the gap complete', async () => {
    const records = [
      marketTrade('1', 120_100),
      marketTrade('2', 120_200),
      marketTrade('3', 180_100),
      marketTrade('4', 240_100),
      marketTrade('5', 300_100),
      marketTrade('6', 300_200),
    ]
    const f = createTradeCache(records)
    try {
      f.emit([records[0]!])
      await f.query({ from: 60_000, to: 120_101 })
      f.emit([records[1]!, records[4]!, records[5]!])
      expect(
        missingTradeRanges({ from: 180_000, to: 300_000 }, f.buffer.snapshot.peek().coverage),
      ).toEqual([{ from: 180_000, to: 300_000 }])
      await f.query({ from: 60_000, to: 300_201 })
      expect(
        f.buffer.snapshot
          .peek()
          .batches.flatMap((batch) => batch.items)
          .map((trade) => trade.tradeId)
          .sort(),
      ).toEqual(['1', '2', '3', '4', '5', '6'])
      expect(
        missingTradeRanges({ from: 60_000, to: 300_200 }, f.buffer.snapshot.peek().coverage),
      ).toEqual([])
      expect(f.fetch.mock.calls.some(([query]) => query.range.from === 180_000)).toBe(true)
    } finally {
      f.cache.destroy()
    }
  })

  // 重连只保留旧的已确认覆盖，新段首毫秒通过历史重叠查询验证。
  it('fills the sleep interval and keeps the latest millisecond unconfirmed', async () => {
    const records = [
      marketTrade('1', 120_100),
      marketTrade('2', 180_100),
      marketTrade('3', 240_100),
      marketTrade('4', 300_100),
      marketTrade('5', 300_100),
      marketTrade('6', 300_200),
    ]
    const f = createTradeCache(records)
    try {
      await f.query({ from: 60_000, to: 120_101 })
      f.emit([records[0]!])
      f.buffer.prepareFrame({ type: 'status', code: 'DISCONNECTED', complete: false }).commit()
      f.buffer.prepareFrame({ type: 'status', code: 'CONNECTED' }).commit()
      f.emit([records[4]!])
      f.emit([records[5]!])
      await f.query({ from: 60_000, to: 300_201 })
      expect(f.buffer.snapshot.peek().batches.flatMap((batch) => batch.items)).toHaveLength(6)
      expect(
        missingTradeRanges({ from: 60_000, to: 300_201 }, f.buffer.snapshot.peek().coverage),
      ).toEqual([{ from: 300_200, to: 300_201 }])
      const calls = f.fetch.mock.calls.length
      await f.query({ from: 60_000, to: 301_000 })
      expect(f.fetch).toHaveBeenCalledTimes(calls)
    } finally {
      f.cache.destroy()
    }
  })

  // 临时失败只影响本次任务，下一次需求可以恢复，失败范围不能被当成覆盖。
  it('retries through the common cache and recovers after a failed query', async () => {
    vi.useFakeTimers()
    const f = createTradeCache([], async () => {
      throw new Error('offline')
    })
    try {
      const pending = expect(f.query({ from: 60_000, to: 120_000 })).rejects.toThrow('offline')
      await vi.runAllTimersAsync()
      await pending
      expect(f.fetch).toHaveBeenCalledTimes(3)
      expect(f.buffer.snapshot.peek().coverage).toEqual([])
      f.fetch.mockImplementation(async ({ range }) => ({ range, complete: true, items: [] }))
      await f.query({ from: 60_000, to: 120_000 })
      expect(f.cache.getTradeSnapshot(tradeSelection, f.buffer)).toMatchObject({
        status: 'ready',
        coverage: [{ from: 60_000, to: 120_000 }],
      })
    } finally {
      f.cache.destroy()
      vi.useRealTimers()
    }
  })

  // 请求复用和迟到取消共用缓存生命周期；成功页在下一页返回前已经可供计算。
  it('publishes each successful page, shares in-flight work and rejects late responses after clear', async () => {
    let release: ((batch: TradeBatch) => void) | undefined
    const f = createTradeCache(
      [],
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    try {
      const first = f.query({ from: 60_000, to: 180_000 })
      const second = f.query({ from: 60_000, to: 180_000 })
      expect(f.fetch).toHaveBeenCalledOnce()
      release?.({
        range: { from: 120_000, to: 180_000 },
        complete: true,
        items: [marketTrade('1', 150_000)],
      })
      await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2))
      expect(f.buffer.snapshot.peek().batches.flatMap((batch) => batch.items)).toHaveLength(1)
      const rejected = Promise.allSettled([first, second])
      f.cache.clear()
      release?.({
        range: { from: 60_000, to: 120_000 },
        complete: true,
        items: [marketTrade('2', 90_000)],
      })
      expect((await rejected).every((result) => result.status === 'rejected')).toBe(true)
      expect(f.buffer.snapshot.peek().batches).toEqual([])
      expect(f.buffer.snapshot.peek().coverage).toEqual([])
    } finally {
      f.cache.destroy()
    }
  })

  // 成交实例属于统一仓库，预算清理同时清除数据与覆盖，避免把淘汰区间画成零成交。
  it('rejects realtime writes before advancing coverage and repairs them after capacity returns', async () => {
    const records = [marketTrade('1', 90_000), marketTrade('2', 90_100), marketTrade('3', 90_200)]
    const f = createTradeCache(records)
    try {
      f.cache.setMaxBytes(1)
      f.emit(records.slice(0, 2))
      expect(f.buffer.snapshot.peek().batches).toEqual([])
      expect(f.buffer.snapshot.peek().coverage).toEqual([])
      expect(f.cache.getTradeSnapshot(tradeSelection, f.buffer).message).toContain('预算')
      f.cache.setMaxBytes(50 * 1024 * 1024)
      f.emit([records[2]!])
      await f.query({ from: 60_000, to: 90_201 })
      expect(f.buffer.snapshot.peek().batches.flatMap((batch) => batch.items)).toHaveLength(3)
      expect(
        missingTradeRanges({ from: 60_000, to: 90_201 }, f.buffer.snapshot.peek().coverage),
      ).toEqual([])
    } finally {
      f.cache.destroy()
    }
  })

  // 淘汰已验证数据时必须同步撤销其完整性证明。
  it('shares repository identity and invalidates coverage when the common cache evicts trades', async () => {
    const f = createTradeCache([marketTrade('1', 90_000)])
    try {
      await f.query({ from: 60_000, to: 120_000 })
      expect(f.cache.repository.getTrades(tradeSelection)).toBe(f.buffer)
      expect(f.cache.getTradeBuffer(tradeSelection, tradeInstrument)).toBe(f.buffer)
      f.cache.setMaxBytes(1)
      expect(f.buffer.snapshot.peek().coverage).toEqual([])
      expect(f.buffer.snapshot.peek().batches).toEqual([])
      await expect(f.query({ from: 60_000, to: 120_000 })).rejects.toThrow('预算')
      expect(f.buffer.snapshot.peek().coverage).toEqual([])
      expect(f.buffer.snapshot.peek().batches).toEqual([])
      f.cache.setMaxBytes(50 * 1024 * 1024)
      await f.query({ from: 60_000, to: 120_000 })
      expect(f.buffer.snapshot.peek().batches.flatMap((batch) => batch.items)).toHaveLength(1)
      f.cache.repository.deleteInstrument(tradeSelection.instrumentKey)
      expect(f.buffer.disposed).toBe(true)
      expect(f.cache.stats.peek().entryCount).toBe(0)
    } finally {
      f.cache.destroy()
    }
  })
})
