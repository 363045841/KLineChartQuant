import type { DataFetcher } from '../controllers/types'
import { getRegisteredFetcher } from './fetcherDefinitionRegistry'

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
  return def.fetcher(source, config)
}
