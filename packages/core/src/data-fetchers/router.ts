import type { DataFetcher } from '../controllers/types'
import type { TimeShareFetcherFn } from './types'
import { getRegisteredFetcher, fetcherSupportsPeriod, getTimeShareFetcher } from './fetcherDefinitionRegistry'

const FALLBACK_SOURCE = 'baostock'

export const routerDataFetcher: DataFetcher = (source, config) => {
  const def = getRegisteredFetcher(source)
  if (!def) {
    console.warn(
      `[DataFetcher] unknown source "${source}", falling back to "${FALLBACK_SOURCE}"`,
    )
    const fallback = getRegisteredFetcher(FALLBACK_SOURCE)
    if (!fallback) {
      return Promise.reject(
        new Error(
          `[DataFetcher] no fetcher registered for "${source}" and no fallback available`,
        ),
      )
    }
    return fallback.fetcher(source, config)
  }

  if (!fetcherSupportsPeriod(source, config.period)) {
    return Promise.reject(
      new Error(
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
      new Error(`[DataFetcher] "${source}" does not support timeshare data fetching`),
    )
  }
  return fetcher(source, config)
}
