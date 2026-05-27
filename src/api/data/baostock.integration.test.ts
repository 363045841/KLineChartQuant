import { describe, it, expect } from 'vitest'
import { getKlineDataBaoStock, queryKlineDataBaoStock } from './baostock'

/**
 * BaoStock 数据源测试
 *
 * 测试原则：
 * - 限制访问频率，避免触发反爬
 * - 只验证请求能正常返回，不校验具体数据
 * - 每次只发一个请求（Vitest 默认串行执行）
 * - 使用较长超时时间应对网络延迟
 */

// 使用 sequential 确保测试串行执行，避免并发请求
describe.sequential('baostock', () => {
  // 测试获取 K 线数据
  it('should fetch kline data without error', async () => {
    const result = await getKlineDataBaoStock({
      symbol: 'sh.600000',
      start_date: '2024-01-01',
      end_date: '2024-01-10',
      period: 'daily',
      adjust: 'qfq',
      timeout: 30,
    })

    // 只验证返回结果不为空，不校验具体数据
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  }, 35000) // 35秒超时，考虑网络延迟

  // 测试快捷查询接口
  it('should query recent kline data without error', async () => {
    const result = await queryKlineDataBaoStock({
      symbol: 'sh.600000',
      days: 5,
      timeout: 30,
    })

    // 只验证返回结果不为空
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  }, 35000)

  // 测试不同市场（深市）
  it('should fetch Shenzhen stock data without error', async () => {
    const result = await getKlineDataBaoStock({
      symbol: 'sz.000001',
      start_date: '2024-01-01',
      end_date: '2024-01-05',
      period: 'daily',
      adjust: 'qfq',
      timeout: 30,
    })

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  }, 35000)

  // 测试不复权数据
  it('should fetch unadjusted data without error', async () => {
    const result = await getKlineDataBaoStock({
      symbol: 'sh.600000',
      start_date: '2024-01-01',
      end_date: '2024-01-10',
      period: 'daily',
      adjust: 'none',
      timeout: 30,
    })

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  }, 35000)
})
