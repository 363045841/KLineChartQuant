/**
 * 工具领域适配测试：身份分配、落点解析与读写分发都在命令面完成。
 *
 * 依赖全部是窄接口替身，因此用例直接断言"调用了哪个领域命令"，不需要图表实例。
 */
import { describe, expect, it, vi } from 'vitest'
import type { IndicatorParamDef } from '@/controllers/types'
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
import { formatDrawingAnchorTime } from '../drawingAnchorTime'

/** 构造一个最小指标实例。 */
function instance(
  id: string,
  paneId: string,
  definitionId = 'MACD',
  params: Record<string, unknown> = {},
  ordinal = 0,
): IndicatorInstance {
  return {
    id,
    definitionId,
    label: definitionId,
    name: definitionId,
    paneId,
    ordinal,
    params,
  }
}

/** 构造一个最小图元；默认是主图水平线。 */
function drawing(
  id: string,
  paneId: string,
  overrides: Partial<DrawingObject> = {},
): DrawingObject {
  return {
    id,
    kind: 'horizontal-line',
    paneId,
    visible: true,
    anchors: [{ id: `${id}-a`, type: 'horizontal', price: 10 }],
    params: {},
    style: { stroke: '#fff' },
    ...overrides,
  }
}

describe('indicator commands', () => {
  /** 测试用参数声明：两个数值键，用于验证 resolveDefinition 带回声明。 */
  const MA_PARAMS: ReadonlyArray<IndicatorParamDef> = [
    { key: 'period1', label: '周期 1', type: 'number', default: 5, min: 1 },
    { key: 'period2', label: '周期 2', type: 'number', default: 10, min: 1 },
  ]

  /** 组装指标命令面替身；写操作同步更新实例信号，便于断言返回的最新位置。 */
  function fixture(
    instances: IndicatorInstance[] = [],
    paneIds: ReadonlyArray<string> = [MAIN_PANE_ID, 'pane-a', 'pane-b'],
  ) {
    const state = createSignal<ReadonlyArray<IndicatorInstance>>(instances)
    const added: Array<[string, unknown, string | undefined]> = []
    const moved: Array<[string, unknown]> = []
    const updated: Array<[string, unknown]> = []
    const removed: string[] = []
    const panes = {
      getLayoutSpecs: () => paneIds.map((id) => ({ id })),
    }
    const commands = createChartAgentIndicatorCommands({
      facade: {
        add: (definitionId, params, placement) => {
          if (definitionId === 'missing') return null
          added.push([definitionId, params, placement])
          const paneId = placement === 'sub' ? 'pane-a' : MAIN_PANE_ID
          state.set([
            ...state.peek(),
            {
              ...instance('instance-new', paneId, definitionId),
              params: { ...(params ?? {}) },
            },
          ])
          return 'instance-new'
        },
        update: (instanceId, patch) => {
          updated.push([instanceId, patch])
          state.set(
            state
              .peek()
              .map((item) =>
                item.id === instanceId ? { ...item, params: patch.params ?? item.params } : item,
              ),
          )
          return true
        },
        move: (instanceId, target) => {
          moved.push([instanceId, target])
          state.set(
            state
              .peek()
              .map((item) => (item.id === instanceId ? { ...item, paneId: target.paneId } : item)),
          )
          return true
        },
        remove: (instanceId) => {
          removed.push(instanceId)
          state.set(state.peek().filter((item) => item.id !== instanceId))
          return true
        },
        instances: state,
      },
      panes,
      loadIndicators: vi.fn(async () => undefined),
      resolveCanonicalId: (indicator) =>
        indicator === 'missing' ? null : indicator === 'ma-alias' ? 'MA' : indicator,
      isRendererAvailable: (indicator) => indicator !== 'no-renderer',
      readParamDefs: (indicator) =>
        indicator === 'MA' ? MA_PARAMS : indicator === 'empty' ? [] : undefined,
    })
    return { commands, added, moved, updated, removed }
  }

  it('按行与行内顺序列出指标，不暴露实例 ID', () => {
    const { commands } = fixture([
      instance('main-1', MAIN_PANE_ID, 'MA'),
      instance('sub-b', 'pane-b', 'MACD'),
      instance('sub-a2', 'pane-a', 'RSI', {}, 1),
      instance('sub-a1', 'pane-a', 'RSI', {}, 0),
    ])
    expect(commands.list()).toEqual([
      { indicator: 'MA', params: {}, placement: 'main', row: 0, order: 1 },
      { indicator: 'RSI', params: {}, placement: 'sub', row: 1, order: 1 },
      { indicator: 'RSI', params: {}, placement: 'sub', row: 1, order: 2 },
      { indicator: 'MACD', params: {}, placement: 'sub', row: 2, order: 1 },
    ])
  })

  it('新增返回指标位置而不是实例 ID', () => {
    const { commands, added } = fixture()
    expect(commands.add('MA')).toEqual({
      indicator: 'MA',
      params: {},
      placement: 'main',
      row: 0,
      order: 1,
    })
    expect(added).toEqual([['MA', undefined, undefined]])
  })

  it('主图不在第 0 行时仍按 pane 身份标记 placement', () => {
    const { commands } = fixture(
      [
        instance('sub-1', 'pane-a', 'MACD'),
        instance('main-1', MAIN_PANE_ID, 'MA'),
        instance('sub-2', 'pane-b', 'RSI'),
      ],
      ['pane-a', MAIN_PANE_ID, 'pane-b'],
    )
    expect(commands.list()).toEqual([
      { indicator: 'MACD', params: {}, placement: 'sub', row: 0, order: 1 },
      { indicator: 'MA', params: {}, placement: 'main', row: 1, order: 1 },
      { indicator: 'RSI', params: {}, placement: 'sub', row: 2, order: 1 },
    ])
  })

  it('未注册的指标名称拒绝创建', () => {
    const { commands, added } = fixture()
    expect(() => commands.add('missing')).toThrow(KLineChartError)
    expect(added).toEqual([])
  })

  it('更新按名称定位并返回最新视图', () => {
    const { commands, updated } = fixture([
      instance('main-1', MAIN_PANE_ID, 'MA', { period1: 5, period2: 10 }),
    ])
    expect(commands.update({ indicator: 'MA' }, { period1: 8, period2: 20 })).toEqual({
      indicator: 'MA',
      params: { period1: 8, period2: 20 },
      placement: 'main',
      row: 0,
      order: 1,
    })
    expect(updated).toEqual([['main-1', { params: { period1: 8, period2: 20 } }]])
  })

  it.each([
    {
      name: '名称唯一',
      instances: [instance('main-1', MAIN_PANE_ID, 'MA'), instance('sub-1', 'pane-a')],
      target: { indicator: 'MACD' },
      expected: { indicator: 'MACD', params: {}, placement: 'sub', row: 1, order: 1 },
    },
    {
      name: '同名跨行按 row',
      instances: [instance('a', 'pane-a'), instance('b', 'pane-b')],
      target: { indicator: 'MACD', row: 2 },
      expected: { indicator: 'MACD', params: {}, placement: 'sub', row: 2, order: 1 },
    },
    {
      name: '同名同行按 order',
      instances: [instance('a', 'pane-a', 'RSI', {}, 0), instance('b', 'pane-a', 'RSI', {}, 1)],
      target: { indicator: 'RSI', row: 1, order: 2 },
      expected: { indicator: 'RSI', params: {}, placement: 'sub', row: 1, order: 2 },
    },
  ])('定位：$name', ({ instances, target, expected }) => {
    const { commands } = fixture(instances)
    expect(commands.read(target)).toEqual(expected)
  })

  it.each([
    {
      name: '找不到时列出当前指标',
      instances: [instance('main-1', MAIN_PANE_ID, 'MA')],
      target: { indicator: 'RSI' },
      code: CHART_AGENT_ERROR_CODES.INSTANCE_NOT_FOUND,
      pattern: /Current indicators: MA at row 0 order 1/,
    },
    {
      name: '跨行歧义提示补 row',
      instances: [instance('a', 'pane-a'), instance('b', 'pane-b')],
      target: { indicator: 'MACD' },
      code: CHART_AGENT_ERROR_CODES.INVALID_QUERY,
      pattern: /Add row/,
    },
    {
      name: '同行歧义提示补 order',
      instances: [instance('a', 'pane-a', 'RSI', {}, 0), instance('b', 'pane-a', 'RSI', {}, 1)],
      target: { indicator: 'RSI' },
      code: CHART_AGENT_ERROR_CODES.INVALID_QUERY,
      pattern: /Add order/,
    },
  ])('定位拒绝：$name', ({ instances, target, code, pattern }) => {
    const { commands } = fixture(instances)
    expect(() => commands.read(target)).toThrow(expect.objectContaining({ code }))
    expect(() => commands.read(target)).toThrow(pattern)
  })

  it('移动按 target 定位并返回新位置', () => {
    const { commands, moved } = fixture([instance('main-1', MAIN_PANE_ID, 'MA')])
    expect(commands.move({ indicator: 'MA' }, 1)).toEqual({
      indicator: 'MA',
      params: {},
      placement: 'sub',
      row: 1,
      order: 1,
    })
    expect(moved).toEqual([['main-1', { kind: INSTANCE_MOVE_KIND.PANE, paneId: 'pane-a' }]])
  })

  it('移动到主图所在行时落回主图 pane', () => {
    const { commands, moved } = fixture(
      [instance('sub-1', 'pane-a', 'MACD'), instance('main-1', MAIN_PANE_ID, 'MA')],
      ['pane-a', MAIN_PANE_ID],
    )
    expect(commands.move({ indicator: 'MACD' }, 1)).toEqual({
      indicator: 'MACD',
      params: {},
      placement: 'main',
      row: 1,
      order: 1,
    })
    expect(moved).toEqual([['sub-1', { kind: INSTANCE_MOVE_KIND.PANE, paneId: MAIN_PANE_ID }]])
  })

  it('同一行不调用移动，避免实例被重排到 pane 末尾', () => {
    const { commands, moved } = fixture([instance('sub-1', 'pane-a')])
    expect(commands.move({ indicator: 'MACD' }, 1)).toEqual({
      indicator: 'MACD',
      params: {},
      placement: 'sub',
      row: 1,
      order: 1,
    })
    expect(moved).toEqual([])
  })

  it('移动越界返回可纠正错误', () => {
    const { commands } = fixture([instance('sub-1', 'pane-a')])
    expect(() => commands.move({ indicator: 'MACD' }, 9)).toThrow(
      expect.objectContaining({ code: CHART_AGENT_ERROR_CODES.TARGET_ROW_OUT_OF_RANGE }),
    )
  })

  it('删除返回被删位置', () => {
    const { commands, removed } = fixture([instance('main-1', MAIN_PANE_ID, 'MA')])
    expect(commands.remove({ indicator: 'MA' })).toEqual({
      indicator: 'MA',
      params: {},
      placement: 'main',
      row: 0,
      order: 1,
    })
    expect(removed).toEqual(['main-1'])
  })

  it('解析定义会先加载实现，并带回规范名称与参数声明', async () => {
    const { commands } = fixture()
    await expect(commands.resolveDefinition('ma-alias')).resolves.toEqual({
      indicator: 'MA',
      params: MA_PARAMS,
    })
    await expect(commands.resolveDefinition('empty')).resolves.toEqual({
      indicator: 'empty',
      params: [],
    })
  })

  it.each([
    { name: '未注册', indicator: 'missing' },
    { name: '没有渲染器', indicator: 'no-renderer' },
    { name: '目录没有参数声明', indicator: 'not-described' },
  ])('无法描述的定义返回 null：$name', async ({ indicator }) => {
    const { commands } = fixture()
    await expect(commands.resolveDefinition(indicator)).resolves.toBeNull()
  })
})

describe('drawing commands', () => {
  /** 两行布局：行 0 是主图，行 1 是副图。 */
  const ROWS = ['main', 'pane-a'] as const
  const ANCHOR_TIME = '2026-11-18T09:31:00+08:00'
  const ANCHOR_MS = Date.parse(ANCHOR_TIME)
  const LATER_TIME = '2026-11-19T09:31:00+08:00'

  /** 组装图元命令面替身：行号来自布局，图元身份由文档分配。 */
  function fixture(drawings: DrawingObject[] = []) {
    const created: unknown[] = []
    const updated: Array<[string, unknown]> = []
    const removed: string[] = []
    const commands = createChartAgentDrawingCommands({
      drawingDocument: {
        listCurrentDrawings: () => drawings,
        getDrawing: (id) => drawings.find((item) => item.id === id) ?? null,
      },
      drawingCommands: {
        create: (input) => {
          created.push(input)
          return drawing('d-new', input.paneId, { kind: input.kind })
        },
        updateFromInput: (id, patch) => {
          updated.push([id, patch])
          const current = drawings.find((item) => item.id === id)
          if (current === undefined) return null
          return {
            ...current,
            ...(patch.style === undefined ? {} : { style: { ...current.style, ...patch.style } }),
            ...(patch.labels === undefined ? {} : { labels: patch.labels }),
            ...(patch.visible === undefined ? {} : { visible: patch.visible }),
            ...(patch.locked === undefined ? {} : { locked: patch.locked }),
            ...(patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }),
            ...(patch.timeframeVisibility === undefined
              ? {}
              : { timeframeVisibility: patch.timeframeVisibility }),
          }
        },
        remove: (id) => {
          removed.push(id)
          const current = drawings.find((item) => item.id === id)
          return current !== undefined && current.locked !== true
        },
      },
      scope: () => ({
        rows: ROWS,
        period: '5min',
        timezone: 'Asia/Shanghai',
        workspace: 'kline',
      }),
      bars: () => [],
    })
    return { commands, created, updated, removed }
  }

  it('列表用显示行定位，锚点按种类裁剪坐标轴，布局外的图元不暴露', () => {
    const { commands } = fixture([
      drawing('d-1', 'main'),
      drawing('d-2', 'pane-a', {
        kind: 'vertical-line',
        anchors: [{ id: 'a', type: 'vertical', time: 1_000 }],
      }),
      drawing('d-3', 'gone'),
      drawing('d-4', 'main', { workspaceId: 'timeshare' }),
    ])
    expect(commands.list().drawings).toEqual([
      expect.objectContaining({
        id: 'd-1',
        row: 0,
        anchors: [{ price: 10 }],
        timeframeVisibility: { mode: 'all' },
        visibleInCurrentPeriod: true,
      }),
      expect.objectContaining({
        id: 'd-2',
        row: 1,
        anchors: [{ time: formatDrawingAnchorTime(1_000, 'Asia/Shanghai') }],
      }),
    ])
  })

  it('周期规则决定当前周期可见性', () => {
    const { commands } = fixture([
      drawing('d-1', 'main', {
        timeframeVisibility: { mode: 'current', period: 'daily' },
      }),
    ])
    expect(commands.list().drawings[0]).toMatchObject({
      timeframeVisibility: { mode: 'current', period: 'daily' },
      visibleInCurrentPeriod: false,
    })
  })

  it('未知行拒绝创建并给出行数', () => {
    const { commands, created } = fixture()
    expect(() =>
      commands.create({
        row: 5,
        kind: 'horizontal-line',
        anchors: [{ price: 10 }],
        style: { stroke: '#fff' },
      }),
    ).toThrow(/row 5 is outside the chart layout. Valid rows: 0 through 1/)
    expect(created).toEqual([])
  })

  it.each([
    {
      kind: 'horizontal-line',
      anchors: [{ price: 10 }],
      expected: [{ price: 10 }],
    },
    {
      kind: 'vertical-line',
      anchors: [{ time: ANCHOR_TIME }],
      expected: [{ timestamp: ANCHOR_MS }],
    },
    {
      kind: 'trend-line',
      anchors: [
        { time: ANCHOR_TIME, price: 10 },
        { time: LATER_TIME, price: 12 },
      ],
      expected: [
        { timestamp: ANCHOR_MS, price: 10 },
        { timestamp: Date.parse(LATER_TIME), price: 12 },
      ],
    },
  ] as const)('按种类把锚点转成领域输入：$kind', ({ kind, anchors, expected }) => {
    const { commands, created } = fixture()
    commands.create({ row: 0, kind, anchors: [...anchors], style: { stroke: '#fff' } })
    expect(created).toEqual([
      expect.objectContaining({ kind, paneId: 'main', anchors: expected }),
    ])
  })

  it.each([
    {
      name: '垂直线不接受价格',
      kind: 'vertical-line',
      anchors: [{ time: ANCHOR_TIME, price: 10 }],
      pattern: /takes 1 anchor with time only.*anchor 0 must not include price/,
    },
    {
      name: '水平线不接受时间',
      kind: 'horizontal-line',
      anchors: [{ time: ANCHOR_TIME, price: 10 }],
      pattern: /takes 1 anchor with price only.*anchor 0 must not include time/,
    },
    {
      name: '点数与种类不符',
      kind: 'trend-line',
      anchors: [{ price: 10 }],
      pattern: /takes 2 anchors with time and price.*expected 2 anchors, got 1/,
    },
    {
      name: '缺少时间轴',
      kind: 'trend-line',
      anchors: [{ price: 10 }, { price: 12 }],
      pattern: /anchor 0 needs time; anchor 1 needs time/,
    },
    {
      name: '缺少价格轴',
      kind: 'trend-line',
      anchors: [{ time: ANCHOR_TIME }, { time: LATER_TIME }],
      pattern: /anchor 0 needs price; anchor 1 needs price/,
    },
  ] as const)('锚点形状错误一次说清：$name', ({ kind, anchors, pattern }) => {
    const { commands, created } = fixture()
    expect(() =>
      commands.create({ row: 0, kind, anchors: [...anchors], style: { stroke: '#fff' } }),
    ).toThrow(pattern)
    expect(created).toEqual([])
  })

  it('创建把显示行解析为 Pane，并投影新图元', () => {    const { commands, created } = fixture()
    const view = commands.create({
      row: 1,
      kind: 'horizontal-line',
      anchors: [{ price: 10 }],
      style: { stroke: '#fff' },
    })
    expect(created).toEqual([
      expect.objectContaining({ paneId: 'pane-a', kind: 'horizontal-line' }),
    ])
    expect(view).toMatchObject({ id: 'd-new', row: 1 })
  })

  it('创建把周期可见性与样式一并交给领域层', () => {
    const { commands, created } = fixture()
    commands.create({
      row: 0,
      kind: 'horizontal-line',
      anchors: [{ price: 10 }],
      style: { stroke: '#fff' },
      timeframeVisibility: { mode: 'current', period: 'daily' },
      visible: false,
    })
    expect(created).toEqual([
      expect.objectContaining({
        paneId: 'main',
        timeframeVisibility: { mode: 'current', period: 'daily' },
        visible: false,
      }),
    ])
  })

  it('更新只提交属性并返回最新快照', () => {
    const { commands, updated } = fixture([drawing('d-1', 'main')])
    const view = commands.update('d-1', { visible: false })
    expect(updated).toEqual([['d-1', { visible: false }]])
    expect(view).toMatchObject({ id: 'd-1', row: 0 })
  })

  it('更新不存在的图元列出当前身份', () => {
    const { commands } = fixture([drawing('d-1', 'main')])
    expect(() => commands.update('missing', { visible: false })).toThrow(
      /Unknown drawing 'missing'.*d-1 \(horizontal-line\)/,
    )
  })

  it('删除返回被删快照', () => {
    const { commands, removed } = fixture([drawing('d-1', 'main')])
    expect(commands.remove('d-1')).toMatchObject({ id: 'd-1', row: 0 })
    expect(removed).toEqual(['d-1'])
  })

  it('锁定的图元拒绝删除并给出解锁步骤', () => {
    const { commands } = fixture([drawing('d-1', 'main', { locked: true })])
    expect(() => commands.remove('d-1')).toThrow(/locked.*locked=false/)
    expect(() => commands.remove('d-1')).toThrow(
      expect.objectContaining({ code: DRAWING_ERROR_CODES.LOCKED }),
    )
  })

  it('布局外的图元容器不再可寻址', () => {
    const { commands } = fixture([drawing('d-1', 'main')])
    expect(commands.list().drawings).toHaveLength(1)
    expect(() => commands.remove('missing')).toThrow(
      expect.objectContaining({ code: DRAWING_ERROR_CODES.NOT_FOUND }),
    )
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
