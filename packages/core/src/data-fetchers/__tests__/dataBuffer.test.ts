import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataBuffer } from '../dataBuffer'
import type { DataFetcher, KLineData, SymbolSpec } from '../../controllers/types'

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
        expect(buffer.data()).toEqual([])
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

        expect(buffer.data()).toHaveLength(2)
        expect(buffer.loadedWindow).not.toBeNull()
        expect(buffer.loadedWindow!.earliestTs).toBe(fetchedData[0]!.timestamp)
        expect(buffer.loadedWindow!.latestTs).toBe(fetchedData[1]!.timestamp)

        expect(capturedConfig).not.toBeNull()
        const startDate = new Date(capturedConfig!.startDate).getTime()
        const endDate = new Date(capturedConfig!.endDate).getTime()
        expect(endDate - startDate).toBeGreaterThan(364 * MS_PER_DAY)
        expect(endDate - startDate).toBeLessThanOrEqual(366 * MS_PER_DAY)
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
        expect(buffer.data()).toHaveLength(4)
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

        const timestamps = buffer.data().map((d) => d.timestamp)
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

        expect(fetchCount).toBe(2)

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

        expect(buffer.data()).toEqual([])
    })

    it('setSymbol resets data before loading', async () => {
        const now = Date.now()
        const fetcher: DataFetcher = async () => [makeKLine(now)]

        buffer.setFetcher(fetcher)
        buffer.setSymbol(defaultSpec)

        await vi.waitFor(() => {
            expect(buffer.loading()).toBe(false)
        })

        expect(buffer.data()).toHaveLength(1)

        buffer.setSymbol({ ...defaultSpec, symbol: 'sz.000001' })

        expect(buffer.data()).toEqual([])
        expect(buffer.loadedWindow).toBeNull()

        await vi.waitFor(() => {
            expect(buffer.loading()).toBe(false)
        })

        expect(buffer.data()).toHaveLength(1)
    })

    it('onPrepend is called when data is prepended (earlier timestamps)', async () => {
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
        buffer.onPrepend = (count) => prependCalls.push(count)

        buffer.ensureRange(oneYearAgo - 30 * MS_PER_DAY, oneYearAgo)

        await vi.waitFor(() => {
            expect(buffer.loading()).toBe(false)
        })

        expect(prependCalls).toHaveLength(1)
        expect(prependCalls[0]).toBe(2)
    })

    it('onPrepend is not called for initial load', async () => {
        const now = Date.now()
        const oneYearAgo = now - 365 * MS_PER_DAY
        const fetcher: DataFetcher = async () => [makeKLine(oneYearAgo), makeKLine(now)]

        const prependCalls: number[] = []
        buffer.onPrepend = (count) => prependCalls.push(count)

        buffer.setFetcher(fetcher)
        buffer.setSymbol(defaultSpec)

        await vi.waitFor(() => {
            expect(buffer.loading()).toBe(false)
        })

        expect(prependCalls).toHaveLength(0)
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

        const data2 = [
            makeKLine(1735689600000),
            makeKLine(1738368000000),
        ]
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
})
