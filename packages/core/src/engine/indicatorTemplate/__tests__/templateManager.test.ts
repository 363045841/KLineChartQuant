// 使用真实 Kernel 与 IndexedDB 替身验证指标模板的保存、覆盖、应用与列表一致性。
import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { ChartWorkspaceId } from '../../../foundation/types/chartView.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { registerIndicators } from '../../indicators/pipeline/index.js'
import { createTestChartStateKernel } from '../../state/__tests__/helpers/createTestChartStateKernel.js'
import { extractTemplate, selectTemplateIndicators } from '../impl/templateExtract.js'
import { IndicatorTemplateManager } from '../impl/templateManager.js'
import type { TemplateWorkspaces } from '../types.js'

const DATABASE_NAME = '@363045841yyt/klinechart-indicator-templates'

/** 每个用例使用独立数据库，避免归档相互污染。 */
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})

/** 注册一个只用于摘要断言的原生指标定义；title 用于验证摘要取 name 而不是可本地化标题。 */
function registerTestIndicator(displayName: string, title?: string): string {
  registerIndicators([
    {
      kind: 'descriptor',
      candidate: { key: displayName, origin: 'third-party', identity: 'native' },
      descriptor: {
        name: displayName,
        ...(title === undefined ? {} : { title }),
        displayName,
        kind: IndicatorKind.Indicator,
        category: 'sub',
        defaultPaneId: `pane-${displayName}`,
        defaultParams: {},
      },
    },
  ])
  return displayName
}

/** 以生产 Kernel 捕获与应用方法构造领域管理器。 */
function createManager() {
  const kernel = createTestChartStateKernel({ initialSettings: { theme: 'light' } })
  let applied: TemplateWorkspaces | null = null
  const manager = new IndicatorTemplateManager({
    extractIndicators: () => extractTemplate(kernel.snapshotViewWorkspaces()),
    applyIndicators: (workspaces) => {
      applied = workspaces
      kernel.applyIndicatorTemplate(workspaces)
    },
    userIndicatorConfigurations: kernel.indicator.readonly.configurations,
  })
  return { kernel, manager, appliedSnapshot: () => applied }
}

/**
 * 在 K 线视图加入一个副图指标，返回窗格身份。
 *
 * @remarks
 * 用 `upsertSub` 而不是 `addSub`：前者的入参形状在两条基线一致，
 * 用例不必为了内核 API 的名字差异改动断言本身。
 */
function addSubIndicator(
  kernel: ReturnType<typeof createTestChartStateKernel>,
  indicatorId: string,
  params: Record<string, number> = {},
): string {
  const paneId = `pane-${indicatorId}`
  kernel.indicator.actions.upsertSub({
    instanceId: `instance-${indicatorId}`,
    indicatorId,
    paneId,
    params,
  })
  return paneId
}

it('保存后列表与归档一致，刷新仍可读回', async () => {
  const own = createManager()
  try {
    registerTestIndicator('MACD')
    addSubIndicator(own.kernel, 'MACD', { fast: 12 })
    await own.manager.initialize()

    const id = await own.manager.saveTemplate({ name: '短线' })
    expect(own.manager.templates.peek()).toEqual([
      { id, name: '短线', labels: ['MACD'], instanceCount: 1 },
    ])

    // 新实例模拟刷新：同一数据库读回同一份归档。
    const reopened = createManager()
    await reopened.manager.initialize()
    expect(reopened.manager.templates.peek().map(({ name }) => name)).toEqual(['短线'])
    await reopened.manager.dispose()
    reopened.kernel.dispose()
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('同名保存覆盖原模板，不新增副本', async () => {
  const own = createManager()
  try {
    registerTestIndicator('RSI')
    addSubIndicator(own.kernel, 'RSI')
    await own.manager.initialize()

    const first = await own.manager.saveTemplate({ name: '波段' })
    addSubIndicator(own.kernel, 'RSI-2')
    const second = await own.manager.saveTemplate({ name: '波段' })

    expect(second).toBe(first)
    expect(own.manager.templates.peek()).toHaveLength(1)
    expect(own.manager.templates.peek()[0]?.instanceCount).toBe(2)
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('应用模板只替换指标与副图，商品与周期保持不变', async () => {
  const own = createManager()
  try {
    registerTestIndicator('MACD')
    own.kernel.dataManager.actions.setCurrentSpec({
      symbol: 'BTCUSDT',
      market: 'crypto',
      period: '4h',
    })
    addSubIndicator(own.kernel, 'MACD', { fast: 12, slow: 26 })
    await own.manager.initialize()
    const id = await own.manager.saveTemplate({ name: '加密' })

    // 换掉图上指标与品种，再应用模板：指标回来，品种不回来。
    own.kernel.indicator.actions.removeSub('pane-MACD')
    own.kernel.dataManager.actions.setCurrentSpec({
      symbol: 'AAPL',
      market: 'us',
      period: '1d',
    })
    await own.manager.applyTemplate({ id })

    const spec = own.kernel.dataManager.readonly.currentSpec.peek()
    expect(spec?.symbol).toBe('AAPL')
    expect(spec?.period).toBe('1d')
    const subPanes = own.kernel.indicator.readonly.subPanes.peek()
    expect(subPanes.map(({ indicatorId }) => indicatorId)).toEqual(['MACD'])
    expect(subPanes[0]?.params).toEqual({ fast: 12, slow: 26 })
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('应用模板按最近使用顺序记录最近项，删除模板同时移出最近列表', async () => {
  const own = createManager()
  try {
    registerTestIndicator('KDJ')
    addSubIndicator(own.kernel, 'KDJ')
    await own.manager.initialize()
    const first = await own.manager.saveTemplate({ name: 'A' })
    const second = await own.manager.saveTemplate({ name: 'B' })

    await own.manager.applyTemplate({ id: first })
    await own.manager.applyTemplate({ id: second })
    expect(own.manager.recentTemplateIds.peek()).toEqual([second, first])

    await own.manager.deleteTemplate({ id: second })
    expect(own.manager.recentTemplateIds.peek()).toEqual([first])
    expect(own.manager.templates.peek().map(({ id }) => id)).toEqual([first])
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('名称为空白时拒绝保存，重名改名被拒绝', async () => {
  const own = createManager()
  try {
    registerTestIndicator('BOLL')
    await own.manager.initialize()
    await expect(own.manager.saveTemplate({ name: '   ' })).rejects.toThrow('模板名称不能为空')

    const first = await own.manager.saveTemplate({ name: 'X' })
    await own.manager.saveTemplate({ name: 'Y' })
    await expect(own.manager.renameTemplate({ id: first, name: 'Y' })).rejects.toThrow(
      '已存在同名模板',
    )
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('应用模板报告无法注册的指标，其余照常恢复', async () => {
  const own = createManager()
  try {
    addSubIndicator(own.kernel, 'script_removed')
    await own.manager.initialize()
    const id = await own.manager.saveTemplate({ name: '含失效脚本' })

    const result = await own.manager.applyTemplate({ id })
    expect(result.skipped).toEqual(['script_removed'])
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('模板只提取指标与窗格，不含图表设置、绘图与视口', async () => {
  const own = createManager()
  try {
    const extracted = extractTemplate(own.kernel.snapshotViewWorkspaces())
    expect(Object.keys(extracted)).toEqual([ChartWorkspaceId.KLine, ChartWorkspaceId.TimeShare])
    for (const workspace of Object.values(extracted)) {
      expect(Object.keys(workspace).sort()).toEqual(['instances', 'paneSpecs'])
    }
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('当前指标摘要与模板摘要共用汇总规则并随指标状态更新', async () => {
  const own = createManager()
  try {
    registerTestIndicator('MACD')
    await own.manager.initialize()
    own.kernel.indicator.actions.upsertSub({
      instanceId: 'macd-1',
      indicatorId: 'MACD',
      paneId: 'pane-macd-1',
      params: {},
    })
    expect(own.manager.currentIndicators.peek()).toEqual([{ id: 'MACD', label: 'MACD', count: 1 }])

    own.kernel.indicator.actions.upsertSub({
      instanceId: 'macd-2',
      indicatorId: 'MACD',
      paneId: 'pane-macd-2',
      params: {},
    })
    expect(own.manager.currentIndicators.peek()).toEqual([{ id: 'MACD', label: 'MACD', count: 2 }])

    const id = await own.manager.saveTemplate({ name: '汇总' })
    const summary = own.manager.templates.peek().find((template) => template.id === id)
    expect(summary?.labels).toEqual(['MACD x 2'])
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('摘要显示指标 name 元数据而不是 title', async () => {
  const own = createManager()
  try {
    registerTestIndicator('EXPMA', '指数移动平均')
    await own.manager.initialize()
    addSubIndicator(own.kernel, 'EXPMA')

    expect(own.manager.currentIndicators.peek()).toEqual([
      { id: 'EXPMA', label: 'EXPMA', count: 1 },
    ])
    const id = await own.manager.saveTemplate({ name: '名称' })
    const summary = own.manager.templates.peek().find((template) => template.id === id)
    expect(summary?.labels).toEqual(['EXPMA'])
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('保存时按 indicatorIds 过滤指标与无引用副图', async () => {
  const own = createManager()
  try {
    registerTestIndicator('MA')
    registerTestIndicator('MACD')
    await own.manager.initialize()
    addSubIndicator(own.kernel, 'MA')
    addSubIndicator(own.kernel, 'MACD')

    const id = await own.manager.saveTemplate({ name: '仅 MA', indicatorIds: ['MA'] })
    const summary = own.manager.templates.peek().find((template) => template.id === id)
    expect(summary?.labels).toEqual(['MA'])
    expect(summary?.instanceCount).toBe(1)

    const applied = await own.manager.applyTemplate({ id })
    expect(applied.applied).toBe(1)
    const kline = own.appliedSnapshot()?.[ChartWorkspaceId.KLine]
    expect(kline?.instances.map((instance) => instance.indicatorId)).toEqual(['MA'])
  } finally {
    await own.manager.dispose()
    own.kernel.dispose()
  }
})

it('按 indicatorIds 过滤模板实例并移除无引用副图', () => {
  const workspaces: TemplateWorkspaces = {
    [ChartWorkspaceId.KLine]: {
      instances: [
        {
          instanceId: 'ma-1',
          indicatorId: 'MA',
          paneId: 'main',
          role: 'main',
          ordinal: 0,
          params: {},
        },
        {
          instanceId: 'macd-1',
          indicatorId: 'MACD',
          paneId: 'pane-MACD',
          role: 'sub',
          ordinal: 0,
          params: {},
        },
      ],
      paneSpecs: [
        { id: 'main', ratio: 1 },
        { id: 'pane-MACD', ratio: 1 },
      ],
    },
    [ChartWorkspaceId.TimeShare]: {
      instances: [],
      paneSpecs: [{ id: 'main', ratio: 1 }],
    },
  }

  const filtered = selectTemplateIndicators(workspaces, ['MA'])
  const kline = filtered[ChartWorkspaceId.KLine]
  expect(kline.instances.map((instance) => instance.indicatorId)).toEqual(['MA'])
  expect(kline.paneSpecs.map((spec) => spec.id)).toEqual(['main'])
})
