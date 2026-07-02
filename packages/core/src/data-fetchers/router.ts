import type { DataFetcher } from '../controllers/types'
import { KLineChartError } from '../errors'

import {
  getRegisteredFetcher,
  fetcherSupportsPeriod,
  getTimeShareFetcher,
  getRegisteredFetcherNames,
} from './fetcherDefinitionRegistry'
import type { TimeShareFetcherFn } from './types'

export const routerDataFetcher: DataFetcher = (source, config) => {
  const def = getRegisteredFetcher(source)
  if (!def) {
    const registered = getRegisteredFetcherNames().sort()
    return Promise.reject(
      new KLineChartError(
        'FETCH_FAILED',
        `[DataFetcher] unknown source "${source}". Registered sources: ${registered.join(', ') || 'none'}`,
      ),
    )
  }

  if (!fetcherSupportsPeriod(source, config.period)) {
    return Promise.reject(
      new KLineChartError(
        'FETCH_FAILED',
        `[DataFetcher] "${source}" does not support period "${config.period}". Supported: ${def.capabilities?.join(', ') ?? 'none'}`,
      ),
    )
  }

  return def.fetcher(source, config)
}

export const routerTimeShareFetcher: TimeShareFetcherFn = (source, config) => {
  const fetcher = getTimeShareFetcher(source)
  if (!fetcher) {
    return Promise.reject(
      new KLineChartError(
        'FETCH_FAILED',
        `[DataFetcher] "${source}" does not support timeshare data fetching`,
      ),
    )
  }
  return fetcher(source, config)
}
