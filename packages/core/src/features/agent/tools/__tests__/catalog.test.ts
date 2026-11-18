/**
 * 工具目录契约测试。
 *
 * 目录是纯数据：断言工具名、读写分组、必填字段校验与领域调用，不需要图表实例。
 */
import { describe, expect, it, vi } from 'vitest'
import { Check } from 'typebox/value'

import type {
  BarsQueryInput,
  ChartAgentDrawingCommands,
  ChartAgentDrawingCreateInput,
  ChartAgentDrawingPatch,
  ChartAgentDrawingView,
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorDefinition,
  ChartAgentMarketQueries,
  ChartAgentToolDeps,
  InstrumentLookupInput,
  TimeShareQueryInput,
} from '../../types.js'
import { CHART_TOOL_METADATA, createChartToolCatalog } from '../impl/catalog.js'
import type { ChartToolDefinition } from '../types.js'

/** 测试用指标定义：两个数值参数，覆盖部分传入与完整替换两种语义。 */
const MA_DEFINITION: ChartAgentIndicatorDefinition = {
  indicator: 'MA',
  params: [
    { key: 'period1', label: '周期 1', type: 'number', default: 5, min: 1 },
    { key: 'period2', label: '周期 2', type: 'number', default: 10, min: 1 },
  ],
}

/** 构造一个可断言的指标视图。 */
function view(
  indicator: string,
  params: Record<string, unknown> = {},
  row = 0,
  order = 1,
): {
  indicator: string
  params: Record<string, unknown>
  placement: 'main' | 'sub'
  row: number
  order: number
} {
  return { indicator, params, placement: row === 0 ? 'main' : 'sub', row, order }
}

/** 记录调用的指标命令面替身。 */
function createIndicators(): ChartAgentIndicatorCommands & {
  readonly added: Array<[string, unknown, string | undefined]>
  readonly updates: Array<[unknown, unknown]>
  readonly moves: Array<[unknown, unknown]>
  readonly removals: unknown[]
} {
  const added: Array<[string, unknown, string | undefined]> = []
  const updates: Array<[unknown, unknown]> = []
  const moves: Array<[unknown, unknown]> = []
  const removals: unknown[] = []
  const maView = view('MA', { period1: 5, period2: 10 }, 0)
  const rsiView = view('RSI', { period: 14 }, 1)
  return {
    added,
    updates,
    moves,
    removals,
    list: () => [maView, rsiView],
    read: (target) => (target.indicator === 'MA' ? maView : rsiView),
    add: (indicator, params, placement) => {
      added.push([indicator, params, placement])
      return view(indicator, { ...(params ?? {}) }, placement === 'sub' ? 1 : 0)
    },
    update: (target, params) => {
      updates.push([target, params])
      return view(target.indicator, { ...params }, target.row ?? 0, target.order ?? 1)
    },
    move: (target, row) => {
      moves.push([target, row])
      return view(target.indicator, {}, row)
    },
    remove: (target) => {
      removals.push(target)
      return view(target.indicator, {}, target.row ?? 0, target.order ?? 1)
    },
    resolveDefinition: async (indicator) => {
      if (indicator === 'MA' || indicator === 'ma') return MA_DEFINITION
      if (indicator === 'MACD') return { indicator: 'MACD', params: [] }
      return null
    },
  }
}

/** 记录调用的图元命令面替身；视图形状与真实命令面一致。 */
function createDrawings(): ChartAgentDrawingCommands & {
  readonly created: ChartAgentDrawingCreateInput[]
  readonly updated: Array<[string, ChartAgentDrawingPatch]>
  readonly removed: string[]
} {
  const created: ChartAgentDrawingCreateInput[] = []
  const updated: Array<[string, ChartAgentDrawingPatch]> = []
  const removed: string[] = []
  /** 构造与投影一致的工具视图。 */
  const view = (overrides: Partial<ChartAgentDrawingView> = {}): ChartAgentDrawingView => ({
    id: 'd-1',
    kind: 'horizontal-line',
    row: 0,
    anchors: [{ price: 10 }],
    style: { stroke: '#ef5350' },
    labels: { line: {}, area: {} },
    visible: true,
    locked: false,
    zIndex: null,
    timeframeVisibility: { mode: 'all' },
    visibleInCurrentPeriod: true,
    ...overrides,
  })
  return {
    created,
    updated,
    removed,
    list: () => ({ timezone: 'Asia/Shanghai', period: '5min', drawings: [view()] }),
    create: (input) => {
      created.push(input)
      return view({ kind: input.kind, row: input.row, anchors: input.anchors })
    },
    update: (drawingId, patch) => {
      updated.push([drawingId, patch])
      return view({ id: drawingId })
    },
    remove: (drawingId) => {
      removed.push(drawingId)
      return view({ id: drawingId })
    },
  }
}

/** 记录调用的行情查询面替身；返回值形状与真实查询面一致。 */
function createMarket(): ChartAgentMarketQueries & {
  readonly lookupCalls: InstrumentLookupInput[]
  readonly barCalls: BarsQueryInput[]
  readonly timeShareCalls: TimeShareQueryInput[]
} {
  const lookupCalls: InstrumentLookupInput[] = []
  const barCalls: BarsQueryInput[] = []
  const timeShareCalls: TimeShareQueryInput[] = []
  return {
    lookupCalls,
    barCalls,
    timeShareCalls,
    listSources: (capability) =>
      capability === 'instrument' ? [{ id: 'tdx' }] : [{ id: 'tdx', description: 'A股日线' }],
    lookup: async (input) => {
      lookupCalls.push(input)
      return { content: 'instrument table', summary: 'Matched 1 instrument(s).' }
    },
    bars: async (input) => {
      barCalls.push(input)
      return { content: 'bars text', summary: 'Returned bars.' }
    },
    timeShare: async (input) => {
      timeShareCalls.push(input)
      return { content: 'timeshare text', summary: 'Returned time share.' }
    },
    indicatorValues: async () => 'values text',
  }
}

/** 组装一份可注入的完整依赖。 */
function createDeps(): ChartAgentToolDeps {
  return {
    indicators: createIndicators(),
    drawings: createDrawings(),
    comparisons: {
      list: () => [],
      add: () => true,
      create: async (input) => ({ status: 'added', symbol: input.symbol, name: input.symbol }),
      remove: () => true,
      clear: () => 0,
    },
    market: createMarket(),
  }
}

/** 取指定工具；名称错误时直接失败，避免隐式 undefined。 */
function toolOf(catalog: readonly ChartToolDefinition[], name: string): ChartToolDefinition {
  const tool = catalog.find((item) => item.name === name)
  if (!tool) throw new Error(`missing tool ${name}`)
  return tool
}

describe('chart tool catalog', () => {
  it('按资源成对暴露读写工具，静态清单与运行时目录一致', () => {
    const catalog = createChartToolCatalog(createDeps())
    expect(catalog.map((tool) => tool.name)).toEqual([
      'indicators_list',
      'indicators_write',
      'drawings_list',
      'drawings_write',
      'comparisons_list',
      'comparisons_write',
      'instruments_query',
      'market_bars_query',
      'market_timeshare_query',
      'indicator_values_query',
    ])
    expect(CHART_TOOL_METADATA.map((tool) => tool.name)).toEqual(catalog.map((tool) => tool.name))
    expect(Object.fromEntries(catalog.map((tool) => [tool.name, tool.effect]))).toEqual({
      indicators_list: 'read',
      indicators_write: 'write',
      drawings_list: 'read',
      drawings_write: 'write',
      comparisons_list: 'read',
      comparisons_write: 'write',
      instruments_query: 'read',
      market_bars_query: 'read',
      market_timeshare_query: 'read',
      indicator_values_query: 'read',
    })
  })

  it('指标列表返回名称、位置与当前参数', async () => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'indicators_list')
    const result = await tool.execute({}, context())
    expect(JSON.parse(result.content)).toEqual([
      {
        indicator: 'MA',
        params: { period1: 5, period2: 10 },
        placement: 'main',
        row: 0,
        order: 1,
      },
      { indicator: 'RSI', params: { period: 14 }, placement: 'sub', row: 1, order: 1 },
    ])
  })

  it.each([
    {
      name: '新增缺省参数交给定义默认值',
      input: { action: 'add', indicator: 'MA' },
      expectedCall: ['MA', {}, undefined],
      expectedView: { indicator: 'MA', params: {}, placement: 'main', row: 0, order: 1 },
    },
    {
      name: '新增把别名收敛到规范名称并透传参数与落点',
      input: { action: 'add', indicator: 'ma', params: { period1: 8 }, placement: 'sub' },
      expectedCall: ['MA', { period1: 8 }, 'sub'],
      expectedView: {
        indicator: 'MA',
        params: { period1: 8 },
        placement: 'sub',
        row: 1,
        order: 1,
      },
    },
  ])('$name', async ({ input, expectedCall, expectedView }) => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'indicators_write')
    const result = await tool.execute(input, context())
    expect((deps.indicators as ReturnType<typeof createIndicators>).added).toEqual([expectedCall])
    expect(JSON.parse(result.content)).toEqual({ added: expectedView })
  })

  it.each([
    {
      name: '缺少 indicator',
      input: { action: 'add' },
      pattern: /action=add requires indicator/,
    },
    {
      name: '未知名称',
      input: { action: 'add', indicator: 'missing' },
      pattern:
        /Unknown indicator 'missing'.*This chart currently has: MA at row 0 order 1; RSI at row 1 order 1/,
    },
    {
      name: '未知参数列出合法键',
      input: { action: 'add', indicator: 'MA', params: { period: 8 } },
      pattern: /unknown param 'period'.*Allowed params: period1/,
    },
    {
      name: '参数类型错误',
      input: { action: 'add', indicator: 'MA', params: { period1: 'abc' } },
      pattern: /'period1' must be number/,
    },
    {
      name: '参数超出范围',
      input: { action: 'add', indicator: 'MA', params: { period1: 0 } },
      pattern: /'period1' must be number, min 1/,
    },
    {
      name: '拒绝当前 action 不接受的字段',
      input: { action: 'add', indicator: 'MA', targetRow: 1 },
      pattern:
        /action=add does not accept targetRow. Allowed fields: indicator, params, placement/,
    },
  ])('新增拒绝：$name', async ({ input, pattern }) => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'indicators_write')
    await expect(tool.execute(input, context())).rejects.toThrow(pattern)
  })

  it('更新按 target 定位并整体替换参数', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'indicators_write')
    const result = await tool.execute(
      {
        action: 'update',
        target: { indicator: 'MA', row: 0 },
        params: { period1: 8, period2: 20 },
      },
      context(),
    )
    expect((deps.indicators as ReturnType<typeof createIndicators>).updates).toEqual([
      [{ indicator: 'MA', row: 0 }, { period1: 8, period2: 20 }],
    ])
    expect(JSON.parse(result.content)).toEqual({
      updated: {
        indicator: 'MA',
        params: { period1: 8, period2: 20 },
        placement: 'main',
        row: 0,
        order: 1,
      },
    })
  })

  it.each([
    {
      name: '缺少 target 与 params',
      input: { action: 'update' },
      pattern: /action=update requires target, params/,
    },
    {
      name: '参数不完整时带回当前参数',
      input: { action: 'update', target: { indicator: 'MA' }, params: { period1: 8 } },
      pattern: /missing param 'period2'.*Current params.*period1/,
    },
    {
      name: '拒绝 definitionId',
      input: { action: 'update', target: { indicator: 'MA' }, definitionId: 'MACD' },
      pattern: /action=update does not accept definitionId/,
    },
  ])('更新拒绝：$name', async ({ input, pattern }) => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'indicators_write')
    await expect(tool.execute(input, context())).rejects.toThrow(pattern)
  })

  it('移动返回移动后的位置', async () => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'indicators_write')
    const result = await tool.execute(
      { action: 'move', target: { indicator: 'RSI', row: 1 }, targetRow: 0 },
      context(),
    )
    expect(JSON.parse(result.content)).toEqual({
      moved: { indicator: 'RSI', params: {}, placement: 'main', row: 0, order: 1 },
    })
  })

  it('删除返回被删位置', async () => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'indicators_write')
    const result = await tool.execute(
      { action: 'remove', target: { indicator: 'MA', row: 0 } },
      context(),
    )
    expect(JSON.parse(result.content)).toEqual({
      removed: { indicator: 'MA', params: {}, placement: 'main', row: 0, order: 1 },
    })
  })

  it('不再暴露 clear 动作', async () => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'indicators_write')
    await expect(tool.execute({ action: 'clear' }, context())).rejects.toThrow(
      /Unsupported action 'clear'/,
    )
  })

  it('图元列表返回工具信封：身份是 id，落点是显示行', async () => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'drawings_list')
    const result = await tool.execute({}, context())
    expect(JSON.parse(result.content)).toEqual({
      timezone: 'Asia/Shanghai',
      period: '5min',
      drawings: [
        {
          id: 'd-1',
          kind: 'horizontal-line',
          row: 0,
          anchors: [{ price: 10 }],
          style: { stroke: '#ef5350' },
          labels: { line: {}, area: {} },
          visible: true,
          locked: false,
          zIndex: null,
          timeframeVisibility: { mode: 'all' },
          visibleInCurrentPeriod: true,
        },
      ],
    })
  })

  it.each([
    {
      name: '缺少必填字段',
      input: { action: 'create' },
      pattern: /action=create requires row, kind, anchors, style/,
    },
    {
      name: '缺少描边色',
      input: {
        action: 'create',
        row: 0,
        kind: 'horizontal-line',
        anchors: [{ price: 10 }],
        style: {},
      },
      pattern: /style\.stroke/,
    },
    {
      name: '拒绝错放的 drawingId',
      input: {
        action: 'create',
        row: 0,
        kind: 'horizontal-line',
        anchors: [{ price: 10 }],
        style: { stroke: '#ef5350' },
        drawingId: 'd-1',
      },
      pattern: /action=create does not accept drawingId/,
    },
  ])('图元创建拒绝：$name', async ({ input, pattern }) => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'drawings_write')
    await expect(tool.execute(input, context())).rejects.toThrow(pattern)
  })

  it('图元创建把显示行与锚点原样交给命令面，并返回完整快照', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'drawings_write')
    const anchors = [
      { time: '2026-11-17T09:30:00+08:00', price: 12.3 },
      { time: '2026-11-18T09:30:00+08:00', price: 13.1 },
    ]
    const result = await tool.execute(
      { action: 'create', row: 1, kind: 'trend-line', anchors, style: { stroke: '#ef5350' } },
      context(),
    )
    expect((deps.drawings as ReturnType<typeof createDrawings>).created).toEqual([
      { row: 1, kind: 'trend-line', anchors, style: { stroke: '#ef5350' } },
    ])
    expect(JSON.parse(result.content)).toMatchObject({
      drawing: { id: 'd-1', kind: 'trend-line', row: 1, anchors },
    })
  })

  it.each([
    {
      name: '缺少任何可写属性',
      input: { action: 'update', drawingId: 'd-1' },
      pattern: /at least one of style, labels/,
    },
    {
      name: '拒绝几何字段 anchors',
      input: { action: 'update', drawingId: 'd-1', anchors: [] },
      pattern: /action=update does not accept anchors/,
    },
    {
      name: '拒绝 kind',
      input: { action: 'update', drawingId: 'd-1', kind: 'ray' },
      pattern: /action=update does not accept kind/,
    },
    {
      name: '周期可见性缺参考周期',
      input: { action: 'update', drawingId: 'd-1', timeframeVisibility: { mode: 'above' } },
      pattern: /mode 'above' requires period/,
    },
  ])('图元更新拒绝：$name', async ({ input, pattern }) => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'drawings_write')
    await expect(tool.execute(input, context())).rejects.toThrow(pattern)
  })

  it('图元更新只提交属性，并返回新快照', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'drawings_write')
    const result = await tool.execute(
      { action: 'update', drawingId: 'd-1', visible: false },
      context(),
    )
    expect((deps.drawings as ReturnType<typeof createDrawings>).updated).toEqual([
      ['d-1', { visible: false }],
    ])
    expect(JSON.parse(result.content)).toMatchObject({ drawing: { id: 'd-1' } })
  })

  it('图元删除返回被删快照', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'drawings_write')
    const result = await tool.execute({ action: 'delete', drawingId: 'd-1' }, context())
    expect((deps.drawings as ReturnType<typeof createDrawings>).removed).toEqual(['d-1'])
    expect(JSON.parse(result.content)).toMatchObject({ deleted: { id: 'd-1' } })
  })

  it('锚点契约在描述里由种类声明生成', () => {
    const text = toolOf(createChartToolCatalog(createDeps()), 'drawings_write').description
    expect(text).toContain('vertical-line: 1 anchor with time only')
    expect(text).toContain('horizontal-line: 1 anchor with price only')
    expect(text).toContain('horizontal-ray, cross-line: 1 anchor with time and price')
    expect(text).toContain('parallel-channel, flat-line, disjoint-channel: 3 anchors with time and price')
  })

  it.each([
    {
      name: '只给区域组',
      labels: { area: { '0': { text: '箱体', position: 'center' } } },
      valid: true,
    },
    {
      name: '只给线段组',
      labels: { line: { '0': { text: '边', position: 'start' } } },
      valid: true,
    },
    { name: '不给标签', labels: undefined, valid: true },
    { name: '未知组名', labels: { body: {} }, valid: false },
  ])('图元标签按组可选：$name', ({ labels, valid }) => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'drawings_write')
    const input = {
      action: 'create',
      row: 0,
      kind: 'rectangle',
      anchors: [
        { time: '2026-11-18T09:31:00+08:00', price: 10 },
        { time: '2026-11-18T09:31:00+08:00', price: 12 },
      ],
      ...(labels === undefined ? {} : { labels }),
    }

    expect(Check(tool.parameters, input)).toBe(valid)
  })

  it('只给区域组时把标签原样交给命令面', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'drawings_write')
    const labels = { area: { '0': { text: '箱体', position: 'center' as const } } }
    await tool.execute(
      {
        action: 'create',
        row: 0,
        kind: 'rectangle',
        anchors: [
          { time: '2026-11-18T09:31:00+08:00', price: 10 },
          { time: '2026-11-18T09:31:00+08:00', price: 12 },
        ],
        style: { stroke: '#4A90D9' },
        labels,
      },
      context(),
    )

    expect((deps.drawings as ReturnType<typeof createDrawings>).created[0]?.labels).toEqual(labels)
  })

  it('对比品种歧义结果原样返回，交由模型向用户澄清', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'comparisons_write')
    const result = await tool.execute({ action: 'create', symbol: '600000' }, context())
    expect(JSON.parse(result.content)).toEqual({
      status: 'added',
      symbol: '600000',
      name: '600000',
    })
  })

  it('分时查询用 days 表达单日与多日，缺省为 1', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'market_timeshare_query')
    await tool.execute({ symbol: 'BTCUSDT', tradingDate: '2026-09-01' }, context())
    await tool.execute({ symbol: 'BTCUSDT', tradingDate: '2026-09-01', days: 5 }, context())
    expect((deps.market as ReturnType<typeof createMarket>).timeShareCalls.map((c) => c.days)).toEqual(
      [1, 5],
    )
  })

  it('查询工具在描述中声明当前可用的数据源', () => {
    const catalog = createChartToolCatalog(createDeps())
    for (const name of ['instruments_query', 'market_bars_query', 'market_timeshare_query']) {
      expect(toolOf(catalog, name).description).toContain('Available sources: tdx')
    }
  })

  it.each([
    {
      name: 'K 线省略周期、复权与根数',
      tool: 'market_bars_query',
      input: { symbol: '600519' },
      expected: { period: 'daily', adjustment: 'none', limit: 200 },
    },
    {
      name: 'K 线显式区间不被改写',
      tool: 'market_bars_query',
      input: { symbol: '600519', from: '2026-08-01', to: '2026-10-31', limit: 60 },
      expected: { from: '2026-08-01', to: '2026-10-31', limit: 60 },
    },
    {
      name: '分时省略日期',
      tool: 'market_timeshare_query',
      input: { symbol: '600519' },
      expected: { days: 1 },
    },
  ])('$name', async ({ tool: name, input, expected }) => {
    const deps = createDeps()
    await toolOf(createChartToolCatalog(deps), name).execute(input, context())
    const market = deps.market as ReturnType<typeof createMarket>
    const calls = name === 'market_bars_query' ? market.barCalls : market.timeShareCalls
    expect(calls.at(-1)).toMatchObject(expected)
  })

  it('查询结果同时提供文本与可读摘要', async () => {
    const deps = createDeps()
    const result = await toolOf(createChartToolCatalog(deps), 'market_bars_query').execute(
      { symbol: '600519' },
      context(),
    )
    expect(result).toEqual({ content: 'bars text', summary: 'Returned bars.' })
  })
})

/** 工具执行上下文；目录实现不使用取消信号之外的字段。 */
function context() {
  return { signal: new AbortController().signal, progress: vi.fn() }
}
