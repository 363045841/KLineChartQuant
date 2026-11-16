/**
 * Binance 期权适配器的验收：字符串数字、unit 折算、指数价当前值与场所校验。
 *
 * 用替身 HTTP 客户端回放固定响应，不触网；响应形状按 EAPI 真实字段裁剪。
 */
import { describe, expect, it } from 'vitest'
import { ANALYTICS_ERROR_CODES } from '../errors'
import type { HttpClient, HttpGetOptions, HttpPostOptions } from '../net/types'
import { createBinanceOptionsClient } from '../options/impl/binance'

/** 到期时刻：2026-11-20T08:00:00Z，DTE 约 3.3 天。 */
const EXPIRY = Date.UTC(2026, 10, 20, 8, 0, 0)

/** 回放固定响应的 HTTP 客户端。 */
function fakeHttp(): HttpClient {
  return {
    async getText(options: HttpGetOptions) {
      const url = options.url
      if (url.includes('/eapi/v1/exchangeInfo')) {
        return {
          status: 200,
          elapsedMs: 4,
          body: JSON.stringify({
            optionSymbols: [
              {
                symbol: 'SOL-261120-140-C',
                underlying: 'SOLUSDT',
                side: 'CALL',
                strikePrice: '140.0000',
                expiryDate: EXPIRY,
                unit: 1,
                status: 'TRADING',
              },
              {
                symbol: 'SOL-261120-160-P',
                underlying: 'SOLUSDT',
                side: 'PUT',
                strikePrice: '160.0000',
                expiryDate: EXPIRY,
                unit: 1,
                status: 'TRADING',
              },
              {
                symbol: 'SOL-261120-999-C',
                underlying: 'SOLUSDT',
                side: 'CALL',
                strikePrice: '999.0000',
                expiryDate: EXPIRY,
                unit: 1,
                status: 'EXPIRED',
              },
            ],
          }),
        }
      }
      if (url.includes('/eapi/v1/mark')) {
        return {
          status: 200,
          elapsedMs: 5,
          body: JSON.stringify([
            { symbol: 'SOL-261120-140-C', markPrice: '12.5', markIV: '0.55' },
            { symbol: 'SOL-261120-160-P', markPrice: '9.5', markIV: '0.62' },
          ]),
        }
      }
      if (url.includes('/eapi/v1/index?')) {
        return { status: 200, elapsedMs: 2, body: JSON.stringify({ indexPrice: '150.00' }) }
      }
      if (url.includes('/eapi/v1/openInterest?')) {
        expect(url).toContain('underlyingAsset=SOL')
        expect(url).toContain('expiration=261120')
        return {
          status: 200,
          elapsedMs: 3,
          body: JSON.stringify([
            { symbol: 'SOL-261120-140-C', sumOpenInterest: '10' },
            { symbol: 'SOL-261120-160-P', sumOpenInterest: '4' },
          ]),
        }
      }
      throw new Error(`未预期的请求：${url}`)
    },
    async postJson(_options: HttpPostOptions) {
      throw new Error('Binance 期权适配器不该发 POST')
    },
  }
}

describe('createBinanceOptionsClient', () => {
  const client = createBinanceOptionsClient({
    httpClient: fakeHttp(),
    proxy: null,
    now: () => Date.UTC(2026, 10, 17),
  })

  it('把 EAPI 符号折成统一合约：字符串数字、unit 与指数价', async () => {
    const chain = await client.getOptionChain('SOL')

    expect(chain.contracts).toHaveLength(2)
    const call = chain.contracts.find((contract) => contract.optionType === 'call')
    expect(call?.currency).toBe('SOL')
    expect(call?.strike).toBe(140)
    expect(call?.expiryIso).toBe('2026-11-20')
    expect(call?.expiryMs).toBe(EXPIRY)
    // 10 张 × unit 1
    expect(call?.openInterest).toBe(10)
    // 0.55 → 55%
    expect(call?.markIvPercent).toBeCloseTo(55, 10)
    // 没有每个到期的期货价，用指数价近似
    expect(call?.underlyingPrice).toBe(150)
    expect(call?.creationTimestamp).toBe(Date.UTC(2026, 10, 17))
    // 过期状态的行被过滤掉
    expect(chain.contracts.some((contract) => contract.strike === 999)).toBe(false)
  })

  it('拒绝不属于 Binance 的标的，不做静默降级', async () => {
    await expect(client.getOptionChain('BTC')).rejects.toMatchObject({
      code: ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
    })
  })

  it('指数价读 indexPrice 字段', async () => {
    await expect(client.getIndexPrice('SOL')).resolves.toMatchObject({ indexPrice: 150 })
  })
})
