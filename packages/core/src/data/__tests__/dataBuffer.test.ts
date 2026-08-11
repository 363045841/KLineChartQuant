import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { KLineData, SymbolSpec } from '../../controllers/types'
import { DataBuffer } from '../buffer/dataBuffer'

function makeKLine(ts: number): KLineData {
  return {
    timestamp: ts,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1000,
  }
}

const MS_PER_DAY = 86_400_000

const defaultSpec: SymbolSpec = {
  symbol: 'sh.600000',
  period: 'daily',
  adjust: 'none',
  source: 'mock',
}

describe('DataBuffer', () => {
  let buffer: DataBuffer

  beforeEach(() => {
    buffer = new DataBuffer()
  })

  it('initial state: empty data, not loading', () => {
    expect(buffer.data().data).toEqual([])
    expect(buffer.loading()).toBe(false)
    expect(buffer.loadedWindow).toBeNull()
  })

  it('setSymbol triggers initial load with default page limit', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const fetchedData = [makeKLine(oneYearAgo + 86400000), makeKLine(now)]

    const requestFetch = vi.fn().mockResolvedValue(fetchedData)
    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    expect(buffer.loading()).toBe(true)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(requestFetch).toHaveBeenCalledWith(defaultSpec, { limit: 500 })
    expect(buffer.data().data).toHaveLength(2)
    expect(buffer.loadedWindow).not.toBeNull()
    expect(buffer.loadedWindow!.earliestTs).toBe(fetchedData[0]!.timestamp)
    expect(buffer.loadedWindow!.latestTs).toBe(fetchedData[1]!.timestamp)
  })

  it('passes the symbol spec through to the requestFetch', async () => {
    const requestFetch = vi.fn().mockResolvedValue([makeKLine(Date.now())])
    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol({ ...defaultSpec, params: { market: 1 } })

    await vi.waitFor(() => expect(requestFetch).toHaveBeenCalled())

    expect(requestFetch.mock.calls[0]?.[0].params).toEqual({ market: 1 })
  })

  it('loads Provider bars with latest and exclusive cursor pages', async () => {
    const latest = [makeKLine(200), makeKLine(300)]
    const older = [makeKLine(100)]
    const requestFetch = vi.fn().mockResolvedValueOnce(latest).mockResolvedValueOnce(older)
    buffer.setRequestFetch(requestFetch)

    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(buffer.loading()).toBe(false))
    expect(requestFetch).toHaveBeenNthCalledWith(1, defaultSpec, { limit: 500 })

    buffer.ensureRange(150, 200)
    await vi.waitFor(() => expect(buffer.loading()).toBe(false))
    expect(requestFetch).toHaveBeenNthCalledWith(2, defaultSpec, {
      limit: 500,
      before: 200,
    })
    expect(buffer.getRawData().map((item) => item.timestamp)).toEqual([100, 200, 300])
  })

  it('keeps loaded data when an older cursor page is empty', async () => {
    const loaded = [makeKLine(200), makeKLine(300)]
    const requestFetch = vi
      .fn()
      .mockResolvedValueOnce({ data: loaded, olderData: 'unknown' })
      .mockResolvedValueOnce({ data: [], olderData: 'exhausted' })
    buffer.setRequestFetch(requestFetch)

    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(buffer.loading()).toBe(false))

    buffer.ensureRange(100, 200)
    await vi.waitFor(() => expect(buffer.loading()).toBe(false))

    expect(buffer.getRawData()).toEqual(loaded)
    expect(buffer.lastError()).toBeNull()

    buffer.ensureRange(50, 200)
    expect(requestFetch).toHaveBeenCalledTimes(2)
  })

  it('ensureRange triggers incremental load when visible range is before loaded window', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY

    const initialData = [makeKLine(oneYearAgo + MS_PER_DAY), makeKLine(now)]

    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY), makeKLine(oneYearAgo)]
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(1)

    const requestTs = oneYearAgo - 30 * MS_PER_DAY
    buffer.ensureRange(requestTs, oneYearAgo)

    expect(buffer.loading()).toBe(true)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(2)
    expect(buffer.data().data).toHaveLength(4)
    expect(buffer.loadedWindow!.earliestTs).toBe(oneYearAgo - 90 * MS_PER_DAY)
  })

  it('ensureRange does nothing when visible range is within loaded window', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const initialData = [makeKLine(oneYearAgo), makeKLine(now)]

    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      return initialData
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(1)

    buffer.ensureRange(oneYearAgo + 100 * MS_PER_DAY, now)

    expect(fetchCount).toBe(1)
  })

  it('merges data and deduplicates by timestamp', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const sharedTs = oneYearAgo + 100 * MS_PER_DAY

    const initialData = [makeKLine(oneYearAgo), makeKLine(sharedTs), makeKLine(now)]
    const incrementalData = [makeKLine(oneYearAgo - 90 * MS_PER_DAY), makeKLine(sharedTs)]

    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return incrementalData
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    const timestamps = buffer.getRawData().map((d) => d.timestamp)
    const uniqueTimestamps = new Set(timestamps)
    expect(timestamps.length).toBe(uniqueTimestamps.size)
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b))
  })

  it('queues concurrent ensureRange calls', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY

    const initialData = [makeKLine(oneYearAgo + MS_PER_DAY), makeKLine(now)]
    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      await new Promise((r) => setTimeout(r, 10))
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY)]
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)
    buffer.ensureRange(oneYearAgo - 120 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBeGreaterThanOrEqual(2)
  })

  it('deduplicates same-boundary ensureRange calls while request is pending', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY

    const initialData = [makeKLine(oneYearAgo), makeKLine(now)]
    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      await new Promise((r) => setTimeout(r, 10))
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY)]
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)
    buffer.ensureRange(oneYearAgo - 60 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(2)
  })

  it('dispose prevents further fetches', async () => {
    const requestFetch = vi.fn().mockResolvedValue([makeKLine(Date.now())])

    buffer.setRequestFetch(requestFetch)
    buffer.dispose()

    expect(buffer.data().data).toEqual([])
  })

  it('setSymbol resets data before loading', async () => {
    const now = Date.now()
    const requestFetch = vi.fn().mockResolvedValue([makeKLine(now)])

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(buffer.data().data).toHaveLength(1)

    buffer.setSymbol({ ...defaultSpec, symbol: 'sz.000001' })

    expect(buffer.data().data).toEqual([])
    expect(buffer.loadedWindow).toBeNull()

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(buffer.data().data).toHaveLength(1)
  })

  it('ignores an inflight fetch result after inline data replaces the buffer', async () => {
    let resolveFetch!: (data: KLineData[]) => void
    const requestFetch = () =>
      new Promise<KLineData[]>((resolve) => {
        resolveFetch = resolve
      })
    const inline = [makeKLine(100)]

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'))
    buffer.setInlineData(inline)
    resolveFetch([makeKLine(200)])

    await vi.waitFor(() => expect(buffer.loading()).toBe(false))
    expect(buffer.getRawData()).toEqual(inline)
  })

  it('keeps loading true when an old symbol request settles before the new request', async () => {
    const resolvers: Array<(data: KLineData[]) => void> = []
    const requestFetch = () =>
      new Promise<KLineData[]>((resolve) => {
        resolvers.push(resolve)
      })

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
    buffer.setSymbol({ ...defaultSpec, symbol: 'sz.000001' })
    await vi.waitFor(() => expect(resolvers).toHaveLength(2))

    resolvers[0]!([makeKLine(100)])
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(buffer.loading()).toBe(true)

    resolvers[1]!([makeKLine(200)])
    await vi.waitFor(() => expect(buffer.loading()).toBe(false))
  })

  it('data change includes prependedCount when data is prepended (earlier timestamps)', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const initialData = [makeKLine(oneYearAgo), makeKLine(now)]

    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY), makeKLine(oneYearAgo - 45 * MS_PER_DAY)]
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    const prependCalls: number[] = []
    const unsub = buffer.data.subscribe(() => {
      prependCalls.push(buffer.data.peek().prependedCount)
    })

    buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    unsub()
    expect(prependCalls).toContain(2)
  })

  it('prependedCount is 0 for initial load', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const requestFetch = vi.fn().mockResolvedValue([makeKLine(oneYearAgo), makeKLine(now)])

    const prependCalls: number[] = []
    const unsub = buffer.data.subscribe(() => {
      prependCalls.push(buffer.data.peek().prependedCount)
    })

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    unsub()
    expect(prependCalls.filter((c) => c > 0)).toHaveLength(0)
  })

  it('ensureRange allows retry when previous fetch did not advance earliestTs', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const initialData = [makeKLine(oneYearAgo), makeKLine(now)]

    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      // Return data with same timestamps so mergeSortedData deduplicates them,
      // avoiding loadedWindow change. The boundary should remain retryable.
      return initialData
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(1)

    buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(2)

    // Same boundary but the previous fetch did not prepend data, so retry.
    buffer.ensureRange(oneYearAgo - 60 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(3)
  })

  it('ensureRange allows retry when earliestTs moves after successful load', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const initialData = [makeKLine(oneYearAgo), makeKLine(now)]

    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      if (fetchCount === 2) return [makeKLine(oneYearAgo - 90 * MS_PER_DAY)]
      return [makeKLine(oneYearAgo - 180 * MS_PER_DAY)]
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(1)

    buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(2)
    expect(buffer.loadedWindow!.earliestTs).toBe(oneYearAgo - 90 * MS_PER_DAY)

    const newEarliest = oneYearAgo - 90 * MS_PER_DAY
    buffer.ensureRange(newEarliest - 30 * MS_PER_DAY, newEarliest)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(3)
  })

  // ── Int32Array precomputation tests ──

  function expectedMonthKey(ts: number): number {
    const d = new Date(ts)
    return d.getFullYear() * 12 + d.getMonth()
  }

  function expectedDayKey(ts: number): number {
    const d = new Date(ts)
    const yearStart = new Date(d.getFullYear(), 0, 0)
    return d.getFullYear() * 366 + Math.floor((d.getTime() - yearStart.getTime()) / 86400000)
  }

  it('setInlineData precomputes monthKeys and dayKeys', () => {
    const data = [
      makeKLine(1735689600000), // 2025-01-01
      makeKLine(1738368000000), // 2025-02-01
      makeKLine(1740787200000), // 2025-03-01
    ]
    buffer.setInlineData(data)

    const monthKeys = buffer.getMonthKeys()
    const dayKeys = buffer.getDayKeys()
    expect(monthKeys).not.toBeNull()
    expect(dayKeys).not.toBeNull()
    expect(monthKeys!.length).toBe(3)
    expect(dayKeys!.length).toBe(3)

    for (let i = 0; i < data.length; i++) {
      expect(monthKeys![i]).toBe(expectedMonthKey(data[i]!.timestamp))
      expect(dayKeys![i]).toBe(expectedDayKey(data[i]!.timestamp))
    }
  })

  it('setInlineData with empty data sets keys to null', () => {
    buffer.setInlineData([])
    expect(buffer.getMonthKeys()).toBeNull()
    expect(buffer.getDayKeys()).toBeNull()
  })

  it('setInlineData replaces previous keys', () => {
    const data1 = [makeKLine(1735689600000)]
    buffer.setInlineData(data1)
    expect(buffer.getMonthKeys()!.length).toBe(1)

    const data2 = [makeKLine(1735689600000), makeKLine(1738368000000)]
    buffer.setInlineData(data2)
    expect(buffer.getMonthKeys()!.length).toBe(2)
    expect(buffer.getDayKeys()!.length).toBe(2)
  })

  it('dispose clears keys to null', () => {
    buffer.setInlineData([makeKLine(1735689600000)])
    expect(buffer.getMonthKeys()).not.toBeNull()

    buffer.dispose()
    expect(buffer.getMonthKeys()).toBeNull()
    expect(buffer.getDayKeys()).toBeNull()
  })

  it('setSymbol resets keys to null before load', () => {
    buffer.setInlineData([makeKLine(1735689600000)])
    expect(buffer.getMonthKeys()).not.toBeNull()

    buffer.setSymbol({ ...defaultSpec, symbol: 'sz.000002' })
    expect(buffer.getMonthKeys()).toBeNull()
    expect(buffer.getDayKeys()).toBeNull()
  })

  it('keys are available after async fetch completes', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const initialData = [makeKLine(oneYearAgo), makeKLine(now)]

    const requestFetch = vi.fn().mockResolvedValue(initialData)
    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    const monthKeys = buffer.getMonthKeys()
    const dayKeys = buffer.getDayKeys()
    expect(monthKeys).not.toBeNull()
    expect(dayKeys).not.toBeNull()
    expect(monthKeys!.length).toBe(2)
    expect(dayKeys!.length).toBe(2)

    for (let i = 0; i < initialData.length; i++) {
      expect(monthKeys![i]).toBe(expectedMonthKey(initialData[i]!.timestamp))
      expect(dayKeys![i]).toBe(expectedDayKey(initialData[i]!.timestamp))
    }
  })

  it('keys are recomputed after incremental fetch prepends data', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const initialData = [makeKLine(oneYearAgo), makeKLine(now)]
    const prependData = [makeKLine(oneYearAgo - 90 * MS_PER_DAY)]
    const allData = [...prependData, ...initialData]

    let fetchCount = 0
    const requestFetch: (spec: SymbolSpec, page: { limit: number; before?: number }) => Promise<
      KLineData[]
    > = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return prependData
    }

    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(fetchCount).toBe(1)
    expect(buffer.getMonthKeys()!.length).toBe(2)

    buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(buffer.getMonthKeys()!.length).toBe(3)
    for (let i = 0; i < allData.length; i++) {
      expect(buffer.getMonthKeys()![i]).toBe(expectedMonthKey(allData[i]!.timestamp))
      expect(buffer.getDayKeys()![i]).toBe(expectedDayKey(allData[i]!.timestamp))
    }
  })

  it('records lastError when fetch fails after retries', async () => {
    const requestFetch = vi.fn().mockRejectedValue(new Error('[gotdx] stock/kline-by-date failed: 500'))
    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => expect(buffer.loading()).toBe(false), { timeout: 10_000 })
    expect(buffer.lastError()).toBe('[gotdx] stock/kline-by-date failed: 500')
  })

  it('publishes retry progress before the final failure', async () => {
    const requestFetch = vi.fn().mockRejectedValue(new Error('offline'))
    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => expect(buffer.lastError()).toBe('offline Retry 1/3'))
    expect(buffer.loading()).toBe(true)
  })

  it('clears lastError on successful fetch', async () => {
    let fail = true
    const requestFetch = vi.fn().mockImplementation(async () => {
      if (fail) throw new Error('offline')
      return [makeKLine(Date.now())]
    })
    buffer.setRequestFetch(requestFetch)
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(buffer.lastError()).toBe('offline'), { timeout: 10_000 })

    fail = false
    buffer.setSymbol({ ...defaultSpec, symbol: 'sh.600001' })
    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
      expect(buffer.data().data.length).toBe(1)
    })
    expect(buffer.lastError()).toBeNull()
  })

  it('does not report an error for a successful empty page', async () => {
    buffer.setRequestFetch(async () => [])
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(buffer.loading()).toBe(false))
    expect(buffer.lastError()).toBeNull()
  })

  it('clears lastError on setInlineData', async () => {
    buffer.setRequestFetch(async () => {
      throw new Error('boom')
    })
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(buffer.lastError()).toBe('boom'), { timeout: 10_000 })
    buffer.setInlineData([makeKLine(Date.now())])
    expect(buffer.lastError()).toBeNull()
  })
})
