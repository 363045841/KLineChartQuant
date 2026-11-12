// Provider 传输注册表与同源代理 fetch 的行为约束。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProviderProxyFetch,
  PROVIDER_PROXY_PATH,
  PROVIDER_PROXY_TARGET_HEADER,
} from '../browser-agent/provider/impl/provider-proxy-transport.js'
import {
  providerFetch,
  setProviderTransport,
} from '../browser-agent/provider/impl/provider-transport.js'

afterEach(() => {
  setProviderTransport(null)
  vi.unstubAllGlobals()
})

/** 取第一次调用参数，并在未被调用时给出明确失败。 */
function firstCall(
  transport: ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => unknown>>,
): readonly [input: RequestInfo | URL, init?: RequestInit] {
  const call = transport.mock.calls.at(0)
  if (call === undefined) throw new Error('transport was not called')
  return call
}

describe('Provider 传输注册表', () => {
  it('默认使用全局 fetch', async () => {
    const stub = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', stub)

    const response = await providerFetch()('http://127.0.0.1:3425/v1/models')

    expect(stub).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
  })

  it('宿主可替换实现，置空后恢复直连', async () => {
    const stub = vi.fn(async () => new Response('direct', { status: 200 }))
    vi.stubGlobal('fetch', stub)
    const transport = vi.fn(async () => new Response('proxied', { status: 200 }))

    setProviderTransport(transport)
    expect(await (await providerFetch()('http://example.test/v1/models')).text()).toBe('proxied')

    setProviderTransport(null)
    expect(await (await providerFetch()('http://example.test/v1/models')).text()).toBe('direct')
    expect(stub).toHaveBeenCalledOnce()
    expect(transport).toHaveBeenCalledOnce()
  })
})

describe('同源代理 fetch', () => {
  it('把目标地址放进请求头，并转发方法、请求体与取消信号', async () => {
    const response = new Response('ok', { status: 200 })
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response)
    const proxyFetch = createProviderProxyFetch(PROVIDER_PROXY_PATH, transport)
    const controller = new AbortController()

    await proxyFetch('http://127.0.0.1:3425/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer key', 'Content-Type': 'application/json' },
      body: '{"model":"x"}',
      signal: controller.signal,
    })

    const [url, init] = firstCall(transport)
    expect(url).toBe(PROVIDER_PROXY_PATH)
    const headers = new Headers(init?.headers)
    expect(headers.get(PROVIDER_PROXY_TARGET_HEADER)).toBe(
      'http://127.0.0.1:3425/v1/chat/completions',
    )
    expect(headers.get('authorization')).toBe('Bearer key')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"model":"x"}')
    expect(init?.signal).toBe(controller.signal)
  })

  it('接受 Request 输入时保留其地址、方法与请求头', async () => {
    const transport = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok', { status: 200 }),
    )
    const proxyFetch = createProviderProxyFetch(PROVIDER_PROXY_PATH, transport)

    await proxyFetch(
      new Request('http://127.0.0.1:3425/v1/models', { headers: { Accept: 'application/json' } }),
    )

    const [, init] = firstCall(transport)
    const headers = new Headers(init?.headers)
    expect(headers.get(PROVIDER_PROXY_TARGET_HEADER)).toBe('http://127.0.0.1:3425/v1/models')
    expect(headers.get('accept')).toBe('application/json')
    expect(init?.method).toBe('GET')
  })
})
