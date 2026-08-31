// 本文件验证 Core 图表 API 的 @Tool 注册与参数校验边界。
import { describe, expect, it } from 'vitest'

import { getRegisteredChartTools } from '../chartAgentController'

describe('Chart Agent @Tool registry', () => {
  it('registers the exact instrument lookup directly on the Core API', async () => {
    const tool = getRegisteredChartTools().find((item) => item.config.name === 'instruments_query_name')

    expect(tool?.config).toMatchObject({
      safety: 'read-only',
      executionMode: 'parallel',
    })
    await expect(
      tool?.execute({}, { symbol: 600519 }, {
        signal: new AbortController().signal,
        progress: () => undefined,
      }),
    ).rejects.toThrow('/symbol: must be string')
  })
})
