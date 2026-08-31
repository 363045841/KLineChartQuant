/** 品种稳定 ID 与旧身份回退规则测试。 */

import { describe, expect, it } from 'vitest'

import { symbolSpecIdentityKey } from '../symbolIdentity'

describe('symbolSpecIdentityKey', () => {
  // 验证稳定 ID 存在时只依赖来源与 ID，不受旧 market 和 params 字段影响。
  it('优先使用来源范围内的统一品种 ID', () => {
    const first = {
      id: 'gotdx:stock:1:600519',
      symbol: '600519',
      market: 'CN',
      source: 'gotdx',
      params: { market: 1 },
    }
    const second = {
      ...first,
      market: 'OTHER',
      params: { category: 31 },
    }

    expect(symbolSpecIdentityKey(first)).toBe('instrument:gotdx:gotdx:stock:1:600519')
    expect(symbolSpecIdentityKey(second)).toBe(symbolSpecIdentityKey(first))
  })

  // 验证旧调用仍能按来源、市场、交易所、代码和 params 区分品种。
  it('为缺少 ID 的旧品种保留身份回退', () => {
    const main = {
      symbol: '600519',
      market: 'CN',
      exchange: 'SH',
      source: 'gotdx',
      params: { market: 1 },
    }
    const extended = { ...main, params: { category: 31 } }

    expect(symbolSpecIdentityKey(main)).not.toBe(symbolSpecIdentityKey(extended))
  })
})
