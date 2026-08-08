import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { DataFetcher, KLineData, SymbolSpec } from '../../controllers/types'
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

function makeMockFetcher(responses: Map<string, KLineData[]>): DataFetcher {
  return async (source, config) => {
    const key = `${config.symbol}_${config.startDate}_${config.endDate}`
    return responses.get(key) ?? []
  }
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

  it('setSymbol triggers initial load (now - 1 year)', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY
    const fetchedData = [makeKLine(oneYearAgo + 86400000), makeKLine(now)]

    let capturedConfig: { startDate: string; endDate: string } | null = null
    const fetcher: DataFetcher = async (_source, config) => {
      capturedConfig = config
      return fetchedData
    }

    buffer.setFetcher(fetcher)
    buffer.setSymbol(defaultSpec)

    expect(buffer.loading()).toBe(true)

    await vi.waitFor(() => {
      expect(buffer.loading()).toBe(false)
    })

    expect(buffer.data().data).toHaveLength(2)
    expect(buffer.loadedWindow).not.toBeNull()
    expect(buffer.loadedWindow!.earliestTs).toBe(fetchedData[0]!.timestamp)
    expect(buffer.loadedWindow!.latestTs).toBe(fetchedData[1]!.timestamp)

    expect(capturedConfig).not.toBeNull()
    const startDate = new Date(capturedConfig!.startDate).getTime()
    const endDate = new Date(capturedConfig!.endDate).getTime()
    expect(endDate - startDate).toBeGreaterThan(364 * MS_PER_DAY)
    expect(endDate - startDate).toBeLessThanOrEqual(366 * MS_PER_DAY)
  })

  it('passes data source params to the fetcher', async () => {
    const fetcher = vi.fn<DataFetcher>().mockResolvedValue([makeKLine(Date.now())])
    buffer.setFetcher(fetcher)
    buffer.setSymbol({ ...defaultSpec, params: { market: 1 } })

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())

    expect(fetcher.mock.calls[0]?.[1].params).toEqual({ market: 1 })
  })

  it('ensureRange triggers incremental load when visible range is before loaded window', async () => {
    const now = Date.now()
    const oneYearAgo = now - 365 * MS_PER_DAY

    const initialData = [makeKLine(oneYearAgo + MS_PER_DAY), makeKLine(now)]

    let fetchCount = 0
    const fetcher: DataFetcher = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY), makeKLine(oneYearAgo)]
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      return initialData
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return incrementalData
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      await new Promise((r) => setTimeout(r, 10))
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY)]
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      await new Promise((r) => setTimeout(r, 10))
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY)]
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      return [makeKLine(Date.now())]
    }

    buffer.setFetcher(fetcher)
    buffer.dispose()

    expect(buffer.data().data).toEqual([])
  })

  it('setSymbol resets data before loading', async () => {
    const now = Date.now()
    const fetcher: DataFetcher = async () => [makeKLine(now)]

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = () =>
      new Promise<KLineData[]>((resolve) => {
        resolveFetch = resolve
      })
    const inline = [makeKLine(100)]

    buffer.setFetcher(fetcher)
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'))
    buffer.setInlineData(inline)
    resolveFetch([makeKLine(200)])

    await vi.waitFor(() => expect(buffer.loading()).toBe(false))
    expect(buffer.getRawData()).toEqual(inline)
  })

  it('keeps loading true when an old symbol request settles before the new request', async () => {
    const resolvers: Array<(data: KLineData[]) => void> = []
    const fetcher: DataFetcher = () =>
      new Promise<KLineData[]>((resolve) => {
        resolvers.push(resolve)
      })

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return [makeKLine(oneYearAgo - 90 * MS_PER_DAY), makeKLine(oneYearAgo - 45 * MS_PER_DAY)]
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => [makeKLine(oneYearAgo), makeKLine(now)]

    const prependCalls: number[] = []
    const unsub = buffer.data.subscribe(() => {
      prependCalls.push(buffer.data.peek().prependedCount)
    })

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      // Return data with same timestamps so mergeSortedData deduplicates them,
      // avoiding loadedWindow change. The boundary should remain retryable.
      return initialData
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      if (fetchCount === 2) return [makeKLine(oneYearAgo - 90 * MS_PER_DAY)]
      return [makeKLine(oneYearAgo - 180 * MS_PER_DAY)]
    }

    buffer.setFetcher(fetcher)
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

    const fetcher: DataFetcher = async () => initialData
    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      if (fetchCount === 1) return initialData
      return prependData
    }

    buffer.setFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      throw new Error('[gotdx] stock/kline-by-date failed: 500')
    }
    buffer.setFetcher(fetcher)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => expect(buffer.loading()).toBe(false), { timeout: 10_000 })
    expect(buffer.lastError()).toBe('[gotdx] stock/kline-by-date failed: 500')
  })

  it('publishes retry progress before the final failure', async () => {
    const fetcher: DataFetcher = async () => {
      throw new Error('offline')
    }
    buffer.setFetcher(fetcher)
    buffer.setSymbol(defaultSpec)

    await vi.waitFor(() => expect(buffer.lastError()).toBe('offline Retry 1/3'))
    expect(buffer.loading()).toBe(true)
  })

  it('clears lastError on successful fetch', async () => {
    let fail = true
    const fetcher: DataFetcher = async () => {
      if (fail) throw new Error('offline')
      return [makeKLine(Date.now())]
    }
    buffer.setFetcher(fetcher)
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

  it('sets lastError to 暂无K线数据 for successful empty data', async () => {
    buffer.setFetcher(async () => [])
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(buffer.loading()).toBe(false))
    expect(buffer.lastError()).toBe('暂无K线数据')
  })

  it('clears lastError on setInlineData', async () => {
    buffer.setFetcher(async () => {
      throw new Error('boom')
    })
    buffer.setSymbol(defaultSpec)
    await vi.waitFor(() => expect(buffer.lastError()).toBe('boom'), { timeout: 10_000 })
    buffer.setInlineData([makeKLine(Date.now())])
    expect(buffer.lastError()).toBeNull()
  })
})
