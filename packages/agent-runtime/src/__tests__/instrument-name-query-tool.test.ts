// 本文件验证证券名称查询工具的 Core 调用和结果协议。
import { describe, expect, it, vi } from 'vitest'

import { InstrumentNameQueryTool } from '../index'

describe('InstrumentNameQueryTool', () => {
  /** 创建运行工具所需的最小上下文。 */
  function createContext() {
    return {
      runId: 'run-1',
      toolCallId: 'call-1',
      signal: new AbortController().signal,
      progress: vi.fn(),
    }
  }

  it('serializes Core exact matches as JSON and forwards the cancellation signal', async () => {
    const lookupInstrumentsBySymbol = vi.fn().mockResolvedValue([
      { symbol: '600519', name: '贵州茅台', exchange: 'SH', sourceId: 'gotdx' },
    ])
    const tool = new InstrumentNameQueryTool({ lookupInstrumentsBySymbol })
    const context = createContext()

    await expect(tool.execute({ symbol: '600519', sourceIds: ['gotdx'] }, context)).resolves.toEqual({
      content:
        '{"matches":[{"symbol":"600519","name":"贵州茅台","exchange":"SH","sourceId":"gotdx"}]}',
      summary: 'Returned 1 exact instrument match.',
    })
    expect(lookupInstrumentsBySymbol).toHaveBeenCalledWith({
      symbol: '600519',
      sourceIds: ['gotdx'],
      signal: context.signal,
    })
  })
})
