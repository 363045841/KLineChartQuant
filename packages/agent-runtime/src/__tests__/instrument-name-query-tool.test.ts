// 本文件验证证券名称查询工具的精确匹配和取消链路。
import { describe, expect, it, vi } from 'vitest'

import { createInstrumentNameQueryTool } from '../index'

describe('createInstrumentNameQueryTool', () => {
  /** 创建运行工具所需的最小上下文。 */
  function createContext() {
    return {
      runId: 'run-1',
      toolCallId: 'call-1',
      signal: new AbortController().signal,
      progress: vi.fn(),
    }
  }

  it('returns only exact symbol matches and forwards the cancellation signal', async () => {
    const searchInstruments = vi.fn().mockResolvedValue([
      { symbol: '600519', name: '贵州茅台', exchange: 'SH', sourceId: 'gotdx' },
      { symbol: '600519.HK', name: '贵州茅台', exchange: 'HK', sourceId: 'other' },
    ])
    const tool = createInstrumentNameQueryTool({ searchInstruments })
    const context = createContext()

    await expect(tool.execute({ symbol: '600519', sourceIds: ['gotdx'] }, context)).resolves.toEqual({
      content: '600519\t贵州茅台\tSH\tgotdx',
      summary: 'Returned 1 exact instrument match.',
    })
    expect(searchInstruments).toHaveBeenCalledWith({
      keyword: '600519',
      limit: 20,
      sourceIds: ['gotdx'],
      signal: context.signal,
    })
  })

  it('rejects malformed model input before calling the host query port', async () => {
    const searchInstruments = vi.fn()
    const tool = createInstrumentNameQueryTool({ searchInstruments })

    await expect(tool.execute({ symbol: 600519 }, createContext())).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    })
    expect(searchInstruments).not.toHaveBeenCalled()
  })
})
