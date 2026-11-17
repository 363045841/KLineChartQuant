/**
 * 工具领域适配测试：身份分配、落点解析与读写分发都在命令面完成。
 *
 * 依赖全部是窄接口替身，因此用例直接断言"调用了哪个领域命令"，不需要图表实例。
 */
import { describe, expect, it, vi } from 'vitest'
import type { IndicatorInstance } from '@/engine/chart/types'
import type { DrawingObject } from '@/engine/drawing/index'
import { INSTANCE_MOVE_KIND, MAIN_PANE_ID } from '@/engine/pane/types'
import { CHART_AGENT_ERROR_CODES, DRAWING_ERROR_CODES, KLineChartError } from '@/errors'
import { createSignal } from '@/foundation/reactivity/signal'
import {
  createChartAgentDrawingCommands,
  createChartAgentIndicatorCommands,
  createChartAgentMarketQueries,
} from '../chartToolDeps'

/** 构造一个最小指标实例。 */
function instance(id: string, paneId: string, definitionId = 'MACD'): IndicatorInstance {
  return {
    id,
    definitionId,
    label: definitionId,
    name: definitionId,
    paneId,
    ordinal: 0,
    params: {},
  }
}

/** 构造一个最小图元。 */
function drawing(id: string, paneId: string): DrawingObject {
  return {
    id,
    kind: 'horizontal-line',
    paneId,
    visible: true,
    anchors: [{ id: `${id}-a`, type: 'horizontal', time: 1_000, price: 10 }],
    params: {},
    style: { stroke: '#fff' },
  }
}

describe('indicator commands', () => {
  /** 组装指标命令面替身；记录 add / move / update 的实参。 */
  function fixture(instances: IndicatorInstance[] = []) {
    const added: Array<[string, unknown, string | undefined]> = []
    const moved: Array<[string, unknown]> = []
    const panes = {
      getLayoutSpecs: () => [{ id: MAIN_PANE_ID }, { id: 'pane-a' }],
      movePane: vi.fn(() => true),
      addPane: vi.fn(() => 'pane-new'),
      removePane: vi.fn(() => true),
    }
    const commands = createChartAgentIndicatorCommands({
      facade: {
        add: (definitionId, params, placement) => {
          if (definitionId === 'missing') return null
          added.push([definitionId, params, placement])
          return 'instance-new'
        },
        update: vi.fn(() => true),
        move: (instanceId, target) => {
          moved.push([instanceId, target])
          return true
        },
        remove: vi.fn(() => true),
        clear: vi.fn(),
        instances: createSignal<ReadonlyArray<IndicatorInstance>>(instances),
      },
      panes,
      loadIndicators: vi.fn(async () => undefined),
      resolveCanonicalId: (indicatorId) => (indicatorId === 'missing' ? null : indicatorId),
      isRendererAvailable: (indicatorId) => indicatorId !== 'no-renderer',
    })
    return { commands, added, moved, panes }
  }

  it('列出现有指标并按栏顺序投影落点与行号', () => {
    const { commands } = fixture([
      instance('main-1', MAIN_PANE_ID, 'MA'),
      instance('sub-1', 'pane-a'),
    ])
    expect(commands.list()).toEqual([
      {
        instanceId: 'main-1',
        definitionId: 'MA',
        params: {},
        placement: 'main',
        row: null,
      },
      {
        instanceId: 'sub-1',
        definitionId: 'MACD',
        params: {},
        placement: 'sub',
        row: 1,
      },
    ])
  })

  it('未注册的指标定义拒绝创建并提示先查看目录', () => {
    const { commands, added } = fixture()
    expect(() => commands.add('missing')).toThrow(KLineChartError)
    expect(added).toEqual([])
  })

  it('落点 main 把副图指标搬回主图', () => {
    const { commands, moved } = fixture([instance('sub-1', 'pane-a')])
    expect(commands.update('sub-1', { placement: 'main' })).toBe(true)
    expect(moved).toEqual([['sub-1', { kind: INSTANCE_MOVE_KIND.PANE, paneId: MAIN_PANE_ID }]])
  })

  it('落点 sub 从主图切走时先建容器再迁移', () => {
    const { commands, moved, panes } = fixture([instance('main-1', MAIN_PANE_ID, 'MA')])
    expect(commands.update('main-1', { placement: 'sub' })).toBe(true)
    expect(panes.addPane).toHaveBeenCalledOnce()
    expect(moved).toEqual([['main-1', { kind: INSTANCE_MOVE_KIND.PANE, paneId: 'pane-new' }]])
    expect(panes.removePane).not.toHaveBeenCalled()
  })

  it('迁移失败时回收刚建的空容器', () => {
    const { commands, panes, moved } = fixture([instance('main-1', MAIN_PANE_ID, 'MA')])
    // 让第一次迁移失败，验证容器被回收。
    moved.length = 0
    const facadeMove = vi.fn(() => false)
    const failing = createChartAgentIndicatorCommands({
      facade: {
        add: () => 'x',
        update: () => true,
        move: facadeMove,
        remove: () => true,
        clear: () => undefined,
        instances: createSignal<ReadonlyArray<IndicatorInstance>>([
          instance('main-1', MAIN_PANE_ID, 'MA'),
        ]),
      },
      panes,
      loadIndicators: async () => undefined,
      resolveCanonicalId: () => 'MA',
      isRendererAvailable: () => true,
    })
    expect(failing.update('main-1', { placement: 'sub' })).toBe(false)
    expect(panes.removePane).toHaveBeenCalledWith('pane-new')
    expect(commands).toBeDefined()
  })

  it('重排只对副图生效，主图叠加的指标不可重排', () => {
    const { commands, panes } = fixture([
      instance('main-1', MAIN_PANE_ID, 'MA'),
      instance('sub-1', 'pane-a'),
    ])
    expect(commands.move('main-1', 1)).toBe(false)
    expect(commands.move('sub-1', 0)).toBe(true)
    expect(panes.movePane).toHaveBeenCalledWith('pane-a', 0)
  })

  it('清空只删除独占副图的指标，主图叠加保留', () => {
    const removed: string[] = []
    const commands = createChartAgentIndicatorCommands({
      facade: {
        add: () => null,
        update: () => false,
        move: () => false,
        remove: (instanceId) => {
          removed.push(instanceId)
          return true
        },
        clear: () => undefined,
        instances: createSignal<ReadonlyArray<IndicatorInstance>>([
          instance('main-1', MAIN_PANE_ID, 'MA'),
          instance('sub-1', 'pane-a'),
          instance('sub-2', 'pane-b'),
        ]),
      },
      panes: {
        getLayoutSpecs: () => [{ id: MAIN_PANE_ID }, { id: 'pane-a' }, { id: 'pane-b' }],
        movePane: () => true,
        addPane: () => null,
        removePane: () => true,
      },
      loadIndicators: async () => undefined,
      resolveCanonicalId: () => 'MA',
      isRendererAvailable: () => true,
    })
    expect(commands.clear()).toBe(2)
    expect(removed).toEqual(['sub-1', 'sub-2'])
  })

  it('解析定义会先加载实现，没有渲染器时返回 null', async () => {
    const loadIndicators = vi.fn(async () => undefined)
    const commands = createChartAgentIndicatorCommands({
      facade: {
        add: () => null,
        update: () => false,
        move: () => false,
        remove: () => false,
        clear: () => undefined,
        instances: createSignal<ReadonlyArray<IndicatorInstance>>([]),
      },
      panes: {
        getLayoutSpecs: () => [{ id: MAIN_PANE_ID }],
        movePane: () => true,
        addPane: () => null,
        removePane: () => true,
      },
      loadIndicators,
      resolveCanonicalId: (indicatorId) => indicatorId,
      isRendererAvailable: (indicatorId) => indicatorId !== 'no-renderer',
    })
    await expect(commands.resolveDefinition('MACD')).resolves.toBe('MACD')
    await expect(commands.resolveDefinition('no-renderer')).resolves.toBeNull()
    expect(loadIndicators).toHaveBeenCalledTimes(2)
  })
})

describe('drawing commands', () => {
  /** 组装图元命令面替身；主图与指标副图之间互转落点。 */
  function fixture() {
    const created: unknown[] = []
    const readPlacement = (paneId: string) =>
      paneId === MAIN_PANE_ID ? 'main' : paneId === 'pane-a' ? 'sub-1' : null
    const resolvePaneId = (placement: string) =>
      placement === 'main' ? MAIN_PANE_ID : placement === 'sub-1' ? 'pane-a' : null
    const commands = createChartAgentDrawingCommands({
      drawingDocument: {
        listDrawings: () => [drawing('d-1', MAIN_PANE_ID), drawing('d-2', 'pane-a')],
      },
      drawingCommands: {
        create: (input) => {
          created.push(input)
          return drawing('d-3', input.paneId)
        },
        updateFromInput: () => null,
        remove: () => true,
        clear: () => undefined,
      },
      copyDrawings: () => [drawing('d-4', MAIN_PANE_ID)],
      resolvePaneId,
      readPlacement,
    })
    return { commands, created }
  }

  it('图元按落点寻址，快照把容器反投影为落点', () => {
    const { commands } = fixture()
    expect(commands.list().map((item) => item.placement)).toEqual(['main', 'sub-1'])
  })

  it('未知落点拒绝创建，并列出可用词汇', () => {
    const { commands } = fixture()
    expect(() =>
      commands.create({
        placement: 'pane-9',
        kind: 'horizontal-line',
        anchors: [{ price: 10 }],
        style: { stroke: '#fff' },
      }),
    ).toThrow(
      expect.objectContaining({
        code: DRAWING_ERROR_CODES.UNKNOWN_PANE,
      }),
    )
  })

  it('创建时把落点解析成容器身份', () => {
    const { commands, created } = fixture()
    const snapshot = commands.create({
      placement: 'sub-1',
      kind: 'horizontal-line',
      anchors: [{ price: 10 }],
      style: { stroke: '#fff' },
    })
    expect(created).toEqual([
      {
        kind: 'horizontal-line',
        paneId: 'pane-a',
        anchors: [{ price: 10 }],
        style: { stroke: '#fff' },
      },
    ])
    expect(snapshot.placement).toBe('sub-1')
  })
})

describe('market queries', () => {
  const SENTINEL = new Error('cache hit')

  /** 组装行情查询面替身；缓存方法直接以哨兵错误结束，用于断言分支选择。 */
  function fixture(sources: string[] = ['binance']) {
    const cache = {
      queryBars: vi.fn((): Promise<never> => Promise.reject(SENTINEL)),
      queryTimeShare: vi.fn((): Promise<never> => Promise.reject(SENTINEL)),
      queryTimeShareRange: vi.fn((): Promise<never> => Promise.reject(SENTINEL)),
    }
    const queries = createChartAgentMarketQueries({
      sources: () => sources,
      lookup: async () => [],
      cache,
      formatter: {
        formatBars: () => 'bars',
        formatChartBars: () => 'chart bars',
        formatInstrumentLookup: () => 'lookup',
        formatTimeShare: () => 'timeshare',
        formatTimeShareRange: () => 'range',
      },
      indicatorQuery: { queryIndicator: async () => 'values' },
    })
    return { queries, cache }
  }

  it('单日走分时查询，多日走区间查询', async () => {
    const { queries, cache } = fixture()
    await expect(
      queries.timeShare({ symbol: 'BTCUSDT', tradingDate: '2026-09-01', days: 1 }),
    ).rejects.toBe(SENTINEL)
    await expect(
      queries.timeShare({ symbol: 'BTCUSDT', tradingDate: '2026-09-01', days: 3 }),
    ).rejects.toBe(SENTINEL)
    expect(cache.queryTimeShare).toHaveBeenCalledOnce()
    expect(cache.queryTimeShareRange).toHaveBeenCalledOnce()
  })

  it('未启用的数据源在查询前被拒绝，并列出可用值', async () => {
    const { queries, cache } = fixture(['binance'])
    await expect(
      queries.bars({
        symbol: 'BTCUSDT',
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 10,
        sourceId: 'tdx',
      }),
    ).rejects.toMatchObject({ code: CHART_AGENT_ERROR_CODES.INVALID_QUERY })
    expect(cache.queryBars).not.toHaveBeenCalled()
  })
})
