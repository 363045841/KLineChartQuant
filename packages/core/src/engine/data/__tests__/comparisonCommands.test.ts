/** 对比品种写原语：解析、歧义、去重、显隐与删除的领域行为。 */
import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '@/foundation/types/instrument.js'
import type { InstrumentDescriptor } from '@/data/provider/types'
import { COMPARISON_ERROR_CODES, ERROR_CODES, KLineChartError } from '@/errors'
import { DEFAULT_COMPARISON_COLOR } from '../../chartModel/impl/comparison/comparisonState'
import {
  ComparisonCommands,
  type ComparisonCommandsDependencies,
  type ComparisonInstrumentResolution,
} from '../comparisonCommands'
import { symbolSpecIdentityKey } from '../symbolIdentity'
import { makeSymbolSpec } from './helpers/symbolSpecFixture'

/** 构造一个完整品种描述；用例只声明差异。 */
function instrument(
  symbol: string,
  overrides: Partial<InstrumentDescriptor> = {},
): InstrumentDescriptor {
  return {
    id: `${symbol}-ID`,
    source: 'mock',
    symbol,
    name: `${symbol} 名称`,
    instrumentType: 'stock',
    exchange: 'SSE',
    sessionId: 'CN',
    capabilities: {},
    ...overrides,
  }
}

/** 主品种：只用于补齐日期边界。 */
const PRIMARY: SymbolSpec = {
  instrument: instrument('MAIN', { name: 'MAIN 名称' }),
  period: 'daily',
  adjust: 'none',
  startDate: '2020-01-01',
  endDate: '2024-01-01',
}

/** 空解析结果；用例按需覆盖字段。 */
function resolution(
  overrides: Partial<ComparisonInstrumentResolution> = {},
): ComparisonInstrumentResolution {
  return {
    candidates: [],
    searchedSources: ['mock'],
    foundElsewhereSources: [],
    failedSources: [],
    ...overrides,
  }
}

/** 组装命令面与可断言的依赖替身。 */
function createHarness(initialComparisons: ReadonlyArray<SymbolSpec> = []) {
  let specs = initialComparisons.map((item) => ({ ...item }))
  const hidden = new Map<string, boolean>()
  const colors = new Map<string, string>()
  let nextResolution = resolution({ candidates: [instrument('CMP')] })

  const setSpecs = vi.fn((next: ReadonlyArray<SymbolSpec>) => {
    specs = next.map((item) => ({ ...item }))
  })
  const scheduleDraw = vi.fn()
  const registerSpec = vi.fn()
  const setHidden = vi.fn((identity: string, value: boolean) => {
    if (value) hidden.set(identity, true)
    else hidden.delete(identity)
  })
  const resolveInstrument = vi.fn(async () => nextResolution)

  const dependencies: ComparisonCommandsDependencies = {
    getSpecs: () => specs,
    setSpecs,
    registerSpec,
    resolveInstrument,
    isHidden: (identity) => hidden.get(identity) === true,
    setHidden,
    getColor: (identity) => colors.get(identity),
    scheduleDraw,
  }
  return {
    commands: new ComparisonCommands(dependencies),
    setSpecs,
    scheduleDraw,
    registerSpec,
    setHidden,
    resolveInstrument,
    colors,
    hidden,
    specs: () => specs,
    /** 下一次 create 使用的解析结果。 */
    resolveWith(value: ComparisonInstrumentResolution) {
      nextResolution = value
    },
  }
}

/** 对比条目从 identity 派生颜色，模拟 kernel 的颜色同步。 */
function colorFor(harness: ReturnType<typeof createHarness>, identity: string): string {
  const color = '#123456'
  harness.colors.set(identity, color)
  return color
}

describe('ComparisonCommands.list', () => {
  it('返回身份、规格、颜色与可见性，隐藏状态直接反映在快照里', () => {
    const harness = createHarness([{ instrument: instrument('CMP') }])
    const spec = harness.specs()[0]!
    colorFor(harness, symbolSpecIdentityKey(spec))
    harness.hidden.set(symbolSpecIdentityKey(spec), true)

    expect(harness.commands.list()).toEqual([
      {
        identity: 'instrument:mock:CMP-ID',
        spec,
        color: '#123456',
        visible: false,
      },
    ])
  })

  it('颜色尚未同步时使用领域默认色', () => {
    const harness = createHarness([PRIMARY])
    expect(harness.commands.list()[0]?.color).toBe(DEFAULT_COMPARISON_COLOR)
  })
})

describe('ComparisonCommands.create', () => {
  it('按路由字段解析后写入唯一候选，并返回带颜色的快照', async () => {
    const harness = createHarness()
    colorFor(harness, 'instrument:mock:600519-ID')
    harness.resolveWith(resolution({ candidates: [instrument('600519', { name: '贵州茅台' })] }))

    const result = await harness.commands.create({
      symbol: '600519',
      source: 'mock',
      exchange: 'SSE',
      instrumentType: 'stock',
    })
    const spec = harness.specs()[0]!

    expect(harness.resolveInstrument).toHaveBeenCalledWith(
      { symbol: '600519', source: 'mock', exchange: 'SSE', instrumentType: 'stock' },
      undefined,
    )
    expect(spec).toEqual({ instrument: instrument('600519', { name: '贵州茅台' }) })
    expect(harness.registerSpec).toHaveBeenCalledWith(spec)
    expect(harness.setSpecs).toHaveBeenCalledTimes(1)
    expect(harness.scheduleDraw).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      status: 'added',
      comparison: {
        identity: 'instrument:mock:600519-ID',
        spec,
        color: '#123456',
        visible: true,
      },
    })
  })

  it('把取消信号透传给解析层，中止后不写任何状态', async () => {
    const harness = createHarness()
    const controller = new AbortController()
    controller.abort()

    await expect(
      harness.commands.create({ symbol: '600519' }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(harness.resolveInstrument).not.toHaveBeenCalled()
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('零候选时报告实际查询过的源', async () => {
    const harness = createHarness()
    harness.resolveWith(resolution({ searchedSources: ['mock', 'other'] }))

    const error = await harness.commands.create({ symbol: '600519' }).catch((value) => value)
    expect(error).toBeInstanceOf(KLineChartError)
    expect(error.code).toBe(COMPARISON_ERROR_CODES.INSTRUMENT_NOT_FOUND)
    expect(error.message).toContain('Searched: mock, other')
    expect(error.details).toMatchObject({ searchedSources: ['mock', 'other'] })
  })

  it('过滤器排除全部候选时列出真实命中', async () => {
    const harness = createHarness()
    harness.resolveWith(
      resolution({
        candidates: [instrument('600519', { name: '贵州茅台', exchange: 'SSE' })],
      }),
    )

    const error = await harness.commands
      .create({ symbol: '600519', exchange: 'HKEX' })
      .catch((value) => value)
    expect(error.code).toBe(COMPARISON_ERROR_CODES.INSTRUMENT_NOT_FOUND)
    expect(error.message).toContain('Actual matches: stock@SSE "贵州茅台" (source mock)')
  })

  it('限定源未命中但其他源存在时指出换哪个源', async () => {
    const harness = createHarness()
    harness.resolveWith(resolution({ foundElsewhereSources: ['other'] }))

    const error = await harness.commands
      .create({ symbol: '600519', source: 'mock' })
      .catch((value) => value)
    expect(error.message).toContain('it exists in: other')
    expect(error.details).toEqual({
      symbol: '600519',
      searchedSources: ['mock'],
      foundElsewhereSources: ['other'],
    })
  })

  it('有源查询失败且无命中时抛可重试的取数错误，而不是“不存在”', async () => {
    const harness = createHarness()
    harness.resolveWith(
      resolution({ searchedSources: ['mock', 'other'], failedSources: ['other'] }),
    )

    const error = await harness.commands.create({ symbol: '600519' }).catch((value) => value)
    expect(error.code).toBe(ERROR_CODES.FETCH_FAILED)
    expect(error.message).toContain('failed for source other')
    expect(error.details).toMatchObject({ failedSources: ['other'] })
  })

  it('多个候选时返回可原样回传的路由字段，类别未知则不出现 instrumentType', async () => {
    const harness = createHarness()
    harness.resolveWith(
      resolution({
        candidates: [
          instrument('000012', { name: '南玻A', exchange: 'SZSE' }),
          instrument('000012', {
            name: '国债指数',
            exchange: 'CFFEX',
            instrumentType: 'index',
          }),
          instrument('000012', {
            name: '未归一化',
            exchange: 'SSE',
            instrumentType: 'unknown',
          }),
        ],
      }),
    )

    const result = await harness.commands.create({ symbol: '000012' })
    expect(result).toEqual({
      status: 'ambiguous',
      candidates: [
        {
          symbol: '000012',
          name: '南玻A',
          exchange: 'SZSE',
          source: 'mock',
          instrumentType: 'stock',
        },
        {
          symbol: '000012',
          name: '国债指数',
          exchange: 'CFFEX',
          source: 'mock',
          instrumentType: 'index',
        },
        { symbol: '000012', name: '未归一化', exchange: 'SSE', source: 'mock' },
      ],
    })
    expect(harness.setSpecs).not.toHaveBeenCalled()
    expect(harness.registerSpec).not.toHaveBeenCalled()
  })

  it('重复品种抛错并带上既有身份，且不重复登记', async () => {
    const existing = makeSymbolSpec({ instrument: instrument('CMP') })
    const harness = createHarness([existing])
    harness.resolveWith(resolution({ candidates: [instrument('CMP')] }))

    const error = await harness.commands.create({ symbol: 'CMP' }).catch((value) => value)
    expect(error.code).toBe(COMPARISON_ERROR_CODES.DUPLICATE)
    expect(error.details).toEqual({
      symbol: 'CMP',
      identity: 'instrument:mock:CMP-ID',
      source: 'mock',
    })
    expect(harness.registerSpec).not.toHaveBeenCalled()
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })
})

describe('ComparisonCommands.add', () => {
  it('只保留 instrument 与日期边界，周期和复权不进入对比 spec', () => {
    const harness = createHarness()
    const spec = makeSymbolSpec({
      instrument: instrument('CMP'),
      startDate: '2020-01-01',
    })

    expect(harness.commands.add(spec, PRIMARY)).toBe(true)
    expect(harness.specs()[0]).toEqual({
      instrument: instrument('CMP'),
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    })
  })

  it('同一品种已存在时返回 false 且不写入', () => {
    const harness = createHarness([makeSymbolSpec({ instrument: instrument('CMP') })])
    expect(harness.commands.add(makeSymbolSpec({ instrument: instrument('CMP') }), null)).toBe(
      false,
    )
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('不同来源的同一代码是不同品种，可以同时存在', () => {
    const harness = createHarness([
      makeSymbolSpec({ instrument: instrument('CMP', { id: 'CMP-A', source: 'mock' }) }),
    ])
    expect(
      harness.commands.add(
        makeSymbolSpec({ instrument: instrument('CMP', { id: 'CMP-B', source: 'other' }) }),
        null,
      ),
    ).toBe(true)
  })
})

describe('ComparisonCommands.remove', () => {
  it('按 identity 删除并返回被删快照，保留其他对比', () => {
    const harness = createHarness([
      makeSymbolSpec({ instrument: instrument('A', { id: 'A-ID' }) }),
      makeSymbolSpec({ instrument: instrument('B', { id: 'B-ID' }) }),
    ])

    const removed = harness.commands.remove('instrument:mock:A-ID')

    expect(removed.identity).toBe('instrument:mock:A-ID')
    expect(harness.specs().map((item) => item.instrument.symbol)).toEqual(['B'])
    expect(harness.scheduleDraw).toHaveBeenCalledTimes(1)
  })

  it('保留按品种代码删除的公开行为', () => {
    const harness = createHarness([makeSymbolSpec({ instrument: instrument('A', { id: 'A-ID' }) })])
    expect(harness.commands.remove('A').identity).toBe('instrument:mock:A-ID')
  })

  it('未知 identity 抛可纠正错误', () => {
    const harness = createHarness()
    expect(() => harness.commands.remove('missing')).toThrowError(
      expect.objectContaining({ code: COMPARISON_ERROR_CODES.NOT_FOUND }),
    )
  })
})

describe('ComparisonCommands.setVisible', () => {
  it('写显隐并返回最新快照', () => {
    const harness = createHarness([makeSymbolSpec({ instrument: instrument('A', { id: 'A-ID' }) })])
    const identity = symbolSpecIdentityKey(harness.specs()[0]!)

    expect(harness.commands.setVisible(identity, false)).toMatchObject({ visible: false })
    expect(harness.setHidden).toHaveBeenCalledWith(identity, true)
    expect(harness.scheduleDraw).toHaveBeenCalledTimes(1)
  })

  it('未知 identity 抛可纠正错误', () => {
    const harness = createHarness()
    expect(() => harness.commands.setVisible('missing', true)).toThrowError(
      expect.objectContaining({ code: COMPARISON_ERROR_CODES.NOT_FOUND }),
    )
    expect(harness.setHidden).not.toHaveBeenCalled()
  })
})
