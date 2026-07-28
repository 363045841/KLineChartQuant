import { describe, expect, it } from 'vitest'

import { SemanticConfigValidator } from '../validator'

const validConfig = {
  version: '1.0.0',
  data: {
    source: 'baostock',
    market: 'CN',
    symbol: '600000',
    exchange: 'SH',
    startDate: '2025-01-01',
    endDate: '2025-01-02',
    period: 'daily',
    adjust: 'qfq',
  },
}

describe('SemanticConfigValidator market', () => {
  it('rejects config without unified market metadata', async () => {
    const validator = new SemanticConfigValidator()
    const config = structuredClone(validConfig) as { data: Record<string, unknown> }
    delete config.data.market

    const result = await validator.validate(config)

    expect(result.valid).toBe(false)
    expect(result.errors?.join(' ')).toContain('market')
  })

  it('accepts explicit unified market metadata', async () => {
    const validator = new SemanticConfigValidator()

    await expect(validator.validate(validConfig)).resolves.toEqual({ valid: true })
  })
})
