import { describe, expect, it, vi } from 'vitest'

import type { DataFetcher } from '../../../controllers/types'
import { FetchBatchScheduler } from '../fetchBatchScheduler'

describe('FetchBatchScheduler', () => {
  it('passes data source params to the fetcher', async () => {
    const fetcher = vi.fn<DataFetcher>().mockResolvedValue([])
    const scheduler = new FetchBatchScheduler()
    scheduler.setFetcher(fetcher)

    await scheduler.createHandler()(
      {
        symbol: '00700',
        source: 'gotdx',
        period: 'daily',
        params: { category: 71 },
      },
      Date.UTC(2026, 0, 1),
      Date.UTC(2026, 0, 2),
    )

    expect(fetcher.mock.calls[0]?.[1].params).toEqual({ category: 71 })
  })
})
