/**
 * 工具领域适配测试：身份分配、落点解析与读写分发都在命令面完成。
 *
 * 依赖全部是窄接口替身，因此用例直接断言"调用了哪个领域命令"，不需要图表实例。
 */
import { describe, expect, it, vi } from 'vitest'
import type { IndicatorParamDef, SymbolSpec } from '@/controllers/types'
import type {
  BarsWindowCacheQuery,
  BarsWindowCacheResult,
  TimeShareCacheQuery,
  TimeShareCacheResult,
  TimeShareRangeCacheResult,
} from '@/data/buffer/impl/marketDataCache'
import type { InstrumentDescriptor, InstrumentRef, TradingDate } from '@/data/provider/types'
import type { IndicatorInstance } from '@/engine/chart/types'
import type { ComparisonCommandsApi, ComparisonSnapshot } from '@/engine/data/comparisonCommands'
import type { DrawingObject } from '@/engine/drawing/index'
import { INSTANCE_MOVE_KIND, MAIN_PANE_ID } from '@/engine/pane/types'
import {
  CHART_AGENT_ERROR_CODES,
  DRAWING_ERROR_CODES,
  ERROR_CODES,
  KLineChartError,
  MARKET_QUERY_ERROR_CODES,
} from '@/errors'
import { ToolInputValidationError } from '@/foundation/agent/index'
import { createSignal } from '@/foundation/reactivity/signal'
import type { TimeShareData } from '@/foundation/types/price'
import type { ChartAgentMarketQueriesDependencies } from '../../types'
import {
  createChartAgentComparisonCommands,
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
          return drawing('d-new', input.paneId, { kind: input.kind, labels: input.labels })
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

  it('accepts named vertical-line labels and rejects targets on the wrong kind before writing', () => {
    const { commands, created, updated } = fixture([
      drawing('vertical', 'main', { kind: 'vertical-line' }),
    ])
    const input = {
      row: 0,
      kind: 'vertical-line',
      anchors: [{ time: ANCHOR_TIME }],
      style: { stroke: '#fff' },
    } as const
    const label = { text: 'Listing\nFirst trade', position: 'start' } as const
    expect(() => commands.create({ ...input, labels: { top: label } })).toThrow(
      /Allowed targets: line/,
    )
    expect(created).toEqual([])
    expect(() => commands.update('vertical', { labels: { inside: label } })).toThrow(
      /Allowed targets: line/,
    )
    expect(updated).toEqual([])
    expect(commands.create({ ...input, labels: { line: label } }).labels).toEqual({ line: label })
  })

  it('updates and removes targets independently and returns the stored named labels', () => {
    const inside = { text: 'Range', position: 'center' } as const
    const top = { text: 'Breakout', position: 'start' } as const
    const { commands } = fixture([
      drawing('box', 'main', { kind: 'rectangle', labels: { inside } }),
    ])
    expect(commands.update('box', { labels: { top } }).labels).toEqual({ inside, top })
    expect(commands.update('box', { labels: { top, inside: null } }).labels).toEqual({ top })
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
    expect(created).toEqual([expect.objectContaining({ kind, paneId: 'main', anchors: expected })])
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

  it('创建把显示行解析为 Pane，并投影新图元', () => {
    const { commands, created } = fixture()
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

describe('comparison commands', () => {
  /** 组装对比命令面替身；领域快照带完整 spec，工具视图只做投影。 */
  function fixture() {
    const spec: SymbolSpec = {
      instrument: {
        id: '600519',
        source: 'tdx',
        symbol: '600519',
        name: '贵州茅台',
        instrumentType: 'stock',
        exchange: 'SSE',
        sessionId: 'CN',
        capabilities: {},
      },
    }
    const snapshot: ComparisonSnapshot = {
      identity: 'instrument:tdx:600519',
      spec,
      color: '#f59e0b',
      visible: true,
    }
    const created: InstrumentRef[] = []
    const visibility: Array<[string, boolean]> = []
    const removed: string[] = []
    const commands: ComparisonCommandsApi = {
      list: () => [snapshot],
      create: async (input) => {
        created.push(input)
        return { status: 'added', comparison: snapshot }
      },
      add: () => true,
      setVisible: (identity, visible) => {
        visibility.push([identity, visible])
        return { ...snapshot, visible }
      },
      remove: (identity) => {
        removed.push(identity)
        return snapshot
      },
    }
    return { agent: createChartAgentComparisonCommands(commands), created, visibility, removed }
  }

  it('列表投影成模型需要的字段，不展开品种描述', () => {
    const { agent } = fixture()
    expect(agent.list()).toEqual([
      {
        identity: 'instrument:tdx:600519',
        symbol: '600519',
        name: '贵州茅台',
        exchange: 'SSE',
        source: 'tdx',
        instrumentType: 'stock',
        color: '#f59e0b',
        visible: true,
      },
    ])
  })

  it('创建透传路由字段与取消信号，并返回投影后的快照', async () => {
    const { agent, created } = fixture()
    const signal = new AbortController().signal
    const result = await agent.create({ symbol: '600519', source: 'tdx' }, signal)
    expect(created).toEqual([{ symbol: '600519', source: 'tdx' }])
    expect(result).toEqual({
      status: 'added',
      comparison: expect.objectContaining({ identity: 'instrument:tdx:600519', source: 'tdx' }),
    })
  })

  it('显隐与删除复用 identity', () => {
    const { agent, visibility, removed } = fixture()
    agent.setVisible('instrument:tdx:600519', false)
    agent.remove('instrument:tdx:600519')
    expect(visibility).toEqual([['instrument:tdx:600519', false]])
    expect(removed).toEqual(['instrument:tdx:600519'])
  })
})

describe('market queries', () => {
  const TIMEZONE = 'Asia/Shanghai'
  const LATEST_DAY = Date.parse('2026-11-17T00:00:00+08:00')
  const EARLIER_DAY = Date.parse('2026-11-14T00:00:00+08:00')
  const NOW = Date.parse('2026-11-18T10:00:00+08:00')

  /** 构造品种描述；用例只声明差异字段。 */
  function instrument(): InstrumentDescriptor {
    return {
      id: 'tdx:stock:600519',
      source: 'tdx',
      symbol: '600519',
      name: '贵州茅台',
      instrumentType: 'stock',
      exchange: 'SSE',
      capabilities: { bars: { periods: ['daily'], adjustments: ['none'] } },
    }
  }

  /** 构造日线窗口结果；默认最后两根为 11-14 与 11-17。 */
  function dailyWindow(overrides: Partial<BarsWindowCacheResult> = {}): BarsWindowCacheResult {
    const data = [EARLIER_DAY, LATEST_DAY].map((timestamp) => ({
      timestamp,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 10,
    }))
    return {
      source: 'tdx',
      instrument: instrument(),
      series: {
        instrumentId: 'tdx:stock:600519',
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        timezone: TIMEZONE,
        data,
        olderData: 'available',
      },
      truncated: false,
      ...overrides,
    }
  }

  /** 构造单日分时结果；默认空数据，用于表达"该日没有分时"。 */
  function timeShare(query: TimeShareCacheQuery, data: TimeShareData[] = []): TimeShareCacheResult {
    return {
      source: 'tdx',
      instrument: instrument(),
      series: {
        instrumentId: 'tdx:stock:600519',
        tradingDate: query.tradingDate ?? '2026-11-17',
        timezone: TIMEZONE,
        preClose: 1680,
        data,
      },
    }
  }

  /** 构造多日分时结果；区间终点固定为 11-18。 */
  function timeShareRange(): TimeShareRangeCacheResult {
    return {
      source: 'tdx',
      instrument: instrument(),
      range: {
        instrumentId: 'tdx:stock:600519',
        timezone: TIMEZONE,
        requestedDays: 2,
        olderData: 'available',
        days: [
          { tradingDate: '2026-11-17', preClose: 1680, data: [] },
          { tradingDate: '2026-11-18', preClose: 1681, data: [] },
        ],
      },
    }
  }

  /** 组装行情查询面替身；日线窗口、可用交易日与 K 线窗口都按用例声明。 */
  function fixture(
    input: {
      readonly barsSources?: ReadonlyArray<string>
      readonly timeShareSources?: ReadonlyArray<string>
      readonly exact?: ReadonlyArray<InstrumentDescriptor>
      readonly keyword?: ReadonlyArray<InstrumentDescriptor>
      /** 精确查询失败的源；用于验证“没查成”不会被报成“不存在”。 */
      readonly failedSources?: ReadonlyArray<string>
      /** K 线查询返回的窗口；缺省用两根日线。 */
      readonly window?: BarsWindowCacheResult
      /** 有分时数据的交易日；缺省只有 11-17。 */
      readonly availableDays?: ReadonlyArray<TradingDate>
    } = {},
  ) {
    const availableDays = new Set<TradingDate>(input.availableDays ?? ['2026-11-17'])
    const cache: ChartAgentMarketQueriesDependencies['cache'] = {
      queryBars: async () => {
        throw new Error('bars window must use queryBarsWindow')
      },
      queryBarsWindow: vi.fn(
        async (query: BarsWindowCacheQuery): Promise<BarsWindowCacheResult> =>
          input.window ?? dailyWindow(),
      ),
      queryTimeShare: vi.fn(async (query: TimeShareCacheQuery): Promise<TimeShareCacheResult> => {
        const date = query.tradingDate ?? '2026-11-17'
        const data: TimeShareData[] = availableDays.has(date)
          ? [{ timestamp: NOW, price: 1, average: 1 }]
          : []
        return timeShare(query, data)
      }),
      queryTimeShareRange: vi.fn(async (): Promise<TimeShareRangeCacheResult> => timeShareRange()),
    }
    const search = vi.fn(async () => ({
      instruments: [...(input.keyword ?? [])],
      searchedSources: ['tdx'],
      failedSources: [],
    }))
    const queries = createChartAgentMarketQueries({
      listSources: (capability) => {
        const ids =
          capability === 'instrument'
            ? ['tdx']
            : capability === 'bars'
              ? (input.barsSources ?? ['tdx'])
              : (input.timeShareSources ?? ['tdx'])
        return ids.map((id) => ({ id }))
      },
      lookup: async () => ({
        instruments: [...(input.exact ?? [])],
        searchedSources: ['tdx'],
        failedSources: input.failedSources ?? [],
      }),
      search,
      cache,
      now: () => NOW,
      formatter: {
        formatInstrumentLookup: () => 'lookup',
        formatBars: (result) => `bars:${result.series.data.length}:${result.truncated}`,
        formatChartBars: () => 'chart bars',
        formatTimeShareDays: (result) => `timeshare:${result.days.length}:${result.resolvedDate}`,
      },
      indicatorQuery: { queryIndicator: async () => 'values' },
    })
    return { queries, cache, search }
  }

  it('精确命中后不再走关键字搜索', async () => {
    const { queries, search } = fixture({ exact: [instrument()] })
    const result = await queries.lookup({ query: '600519', limit: 10 })
    expect(result.summary).toContain('exact 1')
    expect(search).not.toHaveBeenCalled()
  })

  it('精确无果时返回关键字候选，并标注非精确', async () => {
    const { queries, search } = fixture({ keyword: [instrument()] })
    const result = await queries.lookup({ query: '茅台', limit: 10 })
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: '茅台', limit: 10 }))
    expect(result.summary).toContain('exact 0')
  })

  it('零匹配报可纠正错误并带出已搜索的源', async () => {
    const { queries } = fixture()
    await expect(queries.lookup({ query: 'NOPE', limit: 10 })).rejects.toMatchObject({
      code: ERROR_CODES.INSTRUMENT_NOT_FOUND,
      details: { query: 'NOPE', sources: ['tdx'] },
    })
  })

  it('有源查询失败且无候选时抛取数错误，而不是“不存在”', async () => {
    const { queries } = fixture({ failedSources: ['binance'] })
    await expect(queries.lookup({ query: 'NOPE', limit: 10 })).rejects.toMatchObject({
      code: ERROR_CODES.FETCH_FAILED,
      details: {
        query: 'NOPE',
        searchedSources: ['tdx'],
        failedSources: ['binance'],
      },
    })
  })

  it('K 线把日期窗口与根数上限交给缓存，并回显截断状态', async () => {
    const { queries, cache } = fixture({
      window: dailyWindow({ truncated: true }),
    })
    const result = await queries.bars({
      symbol: '600519',
      period: 'daily',
      adjustment: 'none',
      limit: 60,
      from: '2026-08-01',
      to: '2026-10-31',
    })
    expect(cache.queryBarsWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-08-01',
        to: '2026-10-31',
        limit: 60,
        barAggregation: 'original',
      }),
    )
    expect(result.content).toBe('bars:2:true')
  })

  it.each([
    {
      name: '日线窗口不接受 RFC 3339',
      input: { period: 'daily', adjustment: 'none', limit: 10, from: '2026-08-01T09:30:00+08:00' },
    },
    {
      name: '日内窗口不接受纯日期',
      input: { period: '1min', adjustment: 'none', limit: 10, from: '2026-08-01' },
    },
    {
      name: 'from 不能晚于 to',
      input: {
        period: 'daily',
        adjustment: 'none',
        limit: 10,
        from: '2026-10-01',
        to: '2026-08-01',
      },
    },
  ] as const)('$name', async ({ input }) => {
    const { queries, cache } = fixture()
    await expect(queries.bars({ symbol: '600519', ...input })).rejects.toThrow(
      ToolInputValidationError,
    )
    expect(cache.queryBarsWindow).not.toHaveBeenCalled()
  })

  it('source 必须能服务当前能力，错误里给出可用值', async () => {
    const { queries, cache } = fixture()
    await expect(
      queries.bars({
        symbol: '600519',
        period: 'daily',
        adjustment: 'none',
        limit: 10,
        source: 'ths',
      }),
    ).rejects.toThrow(/source 'ths' cannot serve bars\. Available sources: tdx/)
    expect(cache.queryBarsWindow).not.toHaveBeenCalled()
  })

  it('缺省日期优先今天，今日无数据时回退到日线最后一根', async () => {
    const withToday = fixture({ availableDays: ['2026-11-17', '2026-11-18'] })
    const todayResult = await withToday.queries.timeShare({ symbol: '600519', days: 1 })
    expect(todayResult.content).toBe('timeshare:1:2026-11-18')

    const withoutToday = fixture()
    const fallback = await withoutToday.queries.timeShare({ symbol: '600519', days: 1 })
    expect(fallback.content).toBe('timeshare:1:2026-11-17')
  })

  it('多日分时以解析出的交易日为区间终点', async () => {
    const { queries, cache } = fixture({ availableDays: ['2026-11-17', '2026-11-18'] })
    await queries.timeShare({ symbol: '600519', days: 2 })
    expect(cache.queryTimeShareRange).toHaveBeenCalledWith(
      expect.objectContaining({ endTradingDate: '2026-11-18', days: 2 }),
    )
  })

  it('非交易日报错并给出更早的交易日', async () => {
    const { queries } = fixture()
    await expect(
      queries.timeShare({ symbol: '600519', tradingDate: '2026-11-15', days: 1 }),
    ).rejects.toMatchObject({
      code: MARKET_QUERY_ERROR_CODES.INVALID_TRADING_DATE,
      details: { requested: '2026-11-15', previous: '2026-11-14' },
    })
  })
})
