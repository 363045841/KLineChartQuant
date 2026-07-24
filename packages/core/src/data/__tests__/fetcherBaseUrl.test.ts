import { afterEach, describe, expect, it } from 'vitest'

import {
  clearFetcherBaseUrlsForTest,
  composeFetcherBaseUrl,
  getFetcherBaseUrl,
  normalizeFetcherBaseUrl,
  parseFetcherEndpoint,
  setFetcherBaseUrl,
} from '../fetcherBaseUrl'

describe('fetcherBaseUrl', () => {
  afterEach(() => {
    clearFetcherBaseUrlsForTest()
  })

  it('normalizes trailing slashes', () => {
    expect(normalizeFetcherBaseUrl('http://127.0.0.1:8080///')).toBe('http://127.0.0.1:8080')
  })

  it('falls back when no override is set', () => {
    expect(getFetcherBaseUrl('gotdx', 'http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
  })

  it('stores and clears runtime overrides', () => {
    setFetcherBaseUrl('gotdx', 'http://host.test:9000/')
    expect(getFetcherBaseUrl('gotdx', 'http://127.0.0.1:8080')).toBe('http://host.test:9000')

    setFetcherBaseUrl('gotdx', '')
    expect(getFetcherBaseUrl('gotdx', 'http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
  })

  it('parses host and port from a base URL', () => {
    expect(parseFetcherEndpoint('http://127.0.0.1:8080')).toEqual({
      host: '127.0.0.1',
      port: '8080',
    })
  })

  it('composes a base URL with the fallback protocol', () => {
    expect(composeFetcherBaseUrl('192.168.1.2', '9000', 'http://127.0.0.1:8080')).toBe(
      'http://192.168.1.2:9000',
    )
  })
})
