/**
 * 工具目录契约测试。
 *
 * 目录是纯数据：断言工具名、读写分组、必填字段校验与领域调用，不需要图表实例。
 */
import { describe, expect, it, vi } from 'vitest'

import type {
  ChartAgentDrawingCommands,
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorDefinition,
  ChartAgentMarketQueries,
  ChartAgentToolDeps,
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

/** 记录调用的图元命令面替身。 */
function createDrawings(): ChartAgentDrawingCommands & {
  readonly created: unknown[]
} {
  const created: unknown[] = []
  const snapshot = {
    id: 'd-1',
    kind: 'horizontal-line',
    placement: 'main',
    visible: true,
    locked: false,
    zIndex: null,
    anchors: [{ timestamp: 1, price: 10 }],
    style: { stroke: '#fff' },
    labels: { line: {}, area: {} },
  }
  return {
    created,
    list: () => [snapshot],
    create: (input) => {
      created.push(input)
      return snapshot
    },
    update: () => snapshot,
    remove: () => true,
    copy: () => [snapshot],
    clear: () => 1,
  }
}

/** 记录调用的行情查询面替身。 */
function createMarket(): ChartAgentMarketQueries & {
  readonly timeShareCalls: number[]
} {
  const timeShareCalls: number[] = []
  return {
    timeShareCalls,
    listSourceIds: () => ['binance', 'tdx'],
    lookupInstrument: async () => 'instrument table',
    bars: async () => 'bars text',
    timeShare: async (input) => {
      timeShareCalls.push(input.days)
      return 'timeshare text'
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

  it('图元创建要求落点、种类、锚点与样式，并把落点原样交给命令面', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'drawings_write')
    await expect(tool.execute({ action: 'create' }, context())).rejects.toThrow(
      /action=create requires placement, kind, anchors, style/,
    )
    await tool.execute(
      {
        action: 'create',
        placement: 'i-1',
        kind: 'horizontal-line',
        anchors: [{ price: 10 }],
        style: { stroke: 'red' },
      },
      context(),
    )
    expect((deps.drawings as ReturnType<typeof createDrawings>).created).toEqual([
      {
        placement: 'i-1',
        kind: 'horizontal-line',
        anchors: [{ price: 10 }],
        style: { stroke: 'red' },
      },
    ])
  })

  it('图元创建缺少描边色时拒绝写入', async () => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'drawings_write')
    await expect(
      tool.execute(
        {
          action: 'create',
          placement: 'main',
          kind: 'horizontal-line',
          anchors: [{ price: 10 }],
          style: {},
        },
        context(),
      ),
    ).rejects.toThrow(/style\.stroke/)
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
    expect((deps.market as ReturnType<typeof createMarket>).timeShareCalls).toEqual([1, 5])
  })

  it('查询工具在描述中声明当前可用的数据源', () => {
    const catalog = createChartToolCatalog(createDeps())
    for (const name of ['instruments_query', 'market_bars_query', 'market_timeshare_query']) {
      expect(toolOf(catalog, name).description).toContain('binance, tdx')
    }
  })
})

/** 工具执行上下文；目录实现不使用取消信号之外的字段。 */
function context() {
  return { signal: new AbortController().signal, progress: vi.fn() }
}
