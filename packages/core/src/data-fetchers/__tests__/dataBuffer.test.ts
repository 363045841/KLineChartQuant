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
        buffer.ensureRange(oneYearAgo - 60 * MS_PER_DAY, oneYearAgo)

        await vi.waitFor(() => {
            expect(buffer.loading()).toBe(false)
        })

        expect(fetchCount).toBeGreaterThanOrEqual(2)
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
})
