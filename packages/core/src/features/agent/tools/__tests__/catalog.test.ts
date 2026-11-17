/**
 * 工具目录契约测试。
 *
 * 目录是纯数据：断言工具名、读写分组、必填字段校验与领域调用，不需要图表实例。
 */
import { describe, expect, it, vi } from 'vitest'

import { ToolInputValidationError } from '../../../../foundation/agent/index.js'
import type {
  ChartAgentDrawingCommands,
  ChartAgentIndicatorCommands,
  ChartAgentMarketQueries,
  ChartAgentToolDeps,
} from '../../types.js'
import { CHART_TOOL_METADATA, createChartToolCatalog } from '../impl/catalog.js'
import type { ChartToolDefinition } from '../types.js'

/** 记录调用的指标命令面替身。 */
function createIndicators(): ChartAgentIndicatorCommands & {
  readonly added: Array<[string, unknown, string | undefined]>
  readonly updates: Array<[string, unknown]>
} {
  const added: Array<[string, unknown, string | undefined]> = []
  const updates: Array<[string, unknown]> = []
  return {
    added,
    updates,
    list: () => [{ instanceId: 'i-1', definitionId: 'MACD', params: {}, placement: 'sub', row: 1 }],
    add: (definitionId, params, placement) => {
      added.push([definitionId, params, placement])
      return 'instance-new'
    },
    update: (instanceId, patch) => {
      updates.push([instanceId, patch])
      return true
    },
    move: () => true,
    remove: () => true,
    clear: () => 2,
    resolveDefinition: async (definitionId) => (definitionId === 'missing' ? null : definitionId),
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

  it('指标写入缺少 action 必填字段时抛出点名缺失字段的错误', async () => {
    const catalog = createChartToolCatalog(createDeps())
    const tool = toolOf(catalog, 'indicators_write')
    await expect(tool.execute({ action: 'add' }, context())).rejects.toThrow(
      /action=add requires definitionId/,
    )
    await expect(
      tool.execute({ action: 'update', definitionId: 'MACD' }, context()),
    ).rejects.toThrow(/action=update requires instanceId/)
    await expect(
      tool.execute({ action: 'update', instanceId: 'i-1' }, context()),
    ).rejects.toThrow(/at least one of definitionId, params or placement/)
    await expect(tool.execute({ action: 'remove' }, context())).rejects.toBeInstanceOf(
      ToolInputValidationError,
    )
  })

  it('指标新增先解析定义，再按语义落点创建实例', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'indicators_write')
    const result = await tool.execute(
      { action: 'add', definitionId: 'MACD', placement: 'sub' },
      context(),
    )
    expect((deps.indicators as ReturnType<typeof createIndicators>).added).toEqual([
      ['MACD', undefined, 'sub'],
    ])
    expect(JSON.parse(result.content)).toEqual({ created: 'instance-new' })
  })

  it('指标定义无法解析时拒绝写入并提示先查看目录', async () => {
    const tool = toolOf(createChartToolCatalog(createDeps()), 'indicators_write')
    await expect(
      tool.execute({ action: 'add', definitionId: 'missing' }, context()),
    ).rejects.toThrow(/cannot render/)
  })

  it('指标更新把 definitionId 收敛到规范定义，并透传参数与落点', async () => {
    const deps = createDeps()
    const tool = toolOf(createChartToolCatalog(deps), 'indicators_write')
    await tool.execute(
      {
        action: 'update',
        instanceId: 'i-1',
        definitionId: 'rsi',
        params: { period: 7 },
        placement: 'main',
      },
      context(),
    )
    expect((deps.indicators as ReturnType<typeof createIndicators>).updates).toEqual([
      ['i-1', { definitionId: 'rsi', params: { period: 7 }, placement: 'main' }],
    ])
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
