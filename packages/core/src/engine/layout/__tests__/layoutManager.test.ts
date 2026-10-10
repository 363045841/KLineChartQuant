// 使用真实 Kernel 与 IndexedDB 替身验证布局归档、自动保存和列表顺序。
import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import type { SymbolSpec } from '../../../controllers/types.js'
import type { DrawingObject } from '../../drawing/types.js'
import { MAIN_PANE_ID } from '../../pane/types.js'
import { createTestChartStateKernel } from '../../state/__tests__/helpers/createTestChartStateKernel.js'
import { LayoutManager } from '../impl/layoutManager.js'

/** 每个用例使用独立数据库，避免归档相互污染。 */
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('@363045841yyt/klinechart-layouts')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})

/** 以生产 Kernel 快照和恢复方法构造领域管理器。 */
function createManager() {
  const kernel = createTestChartStateKernel({ initialSettings: { theme: 'light' } })
  const manager = new LayoutManager({
    exportLayout: () => kernel.exportLayout(),
    applyLayout: (document) => kernel.applyLayout(document),
    createLayout: () => kernel.createLayout(),
  })
  return { kernel, manager }
}

/** 按生产订阅方式把图元变更交给布局自动保存，返回释放订阅的方法。 */
function subscribeDrawingAutoSave({ kernel, manager }: ReturnType<typeof createManager>) {
  return kernel.drawing.readonly.drawings.subscribe(() => manager.scheduleAutoSave())
}

/** 构造带时间锚点与工作区身份的真实绘图文档，供存储往返用例复用。 */
function createDrawing(): DrawingObject {
  return {
    id: 'layout-trend-line',
    kind: 'trend-line',
    paneId: MAIN_PANE_ID,
    workspaceId: 'kline',
    visible: true,
    anchors: [
      { id: 'start', type: 'point', time: 1_700_000_000_000, price: 10 },
      { id: 'end', type: 'point', time: 1_700_086_400_000, price: 12 },
    ],
    params: {},
    style: {},
  }
}

it('绘图随布局落盘，复制保留图元，新建与缺少绘图的文档清空图元和选择', async () => {
  const { kernel, manager } = createManager()
  try {
    await manager.initialize()
    const drawing = createDrawing()
    kernel.drawing.actions.addDrawingsAndSelect([drawing])
    const exported = manager.exportLayout()
    expect(exported.drawings).toEqual([drawing])
    expect(exported.drawings).not.toBe(kernel.drawing.readonly.drawings.peek())
    const id = await manager.saveLayout({ name: '带绘图' })
    const copy = await manager.duplicateLayout({ id, name: '绘图副本' })
    await manager.createLayout({ name: '空布局' })
    expect(kernel.drawing.readonly.drawings.peek()).toEqual([])
    expect(kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
    await manager.switchLayout({ id: copy })
    expect(kernel.drawing.readonly.drawings.peek()).toEqual([drawing])
    kernel.drawing.actions.setSelectedDrawingIds([drawing.id])
    const { drawings: _drawings, ...withoutDrawings } = exported
    await manager.applyLayout(withoutDrawings)
    expect(kernel.drawing.readonly.drawings.peek()).toEqual([])
    expect(kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
    await manager.switchLayout({ id })
  } finally {
    await manager.dispose()
    kernel.dispose()
  }
  const restored = createManager()
  try {
    await restored.manager.initialize()
    expect(restored.kernel.drawing.readonly.drawings.peek()).toEqual([createDrawing()])
    expect(restored.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
  } finally {
    await restored.manager.dispose()
    restored.kernel.dispose()
  }
})

it('绘图修改和删除通过自动保存落盘，重新打开不复活已删除的图元', async () => {
  const first = createManager()
  await first.manager.initialize()
  // 复用生产中的信号订阅，验证绘图变化会标记文档，而选择变化不会进入快照。
  const unsubscribe = subscribeDrawingAutoSave(first)
  try {
    const drawing = createDrawing()
    first.kernel.drawing.actions.addDrawingsAndSelect([drawing])
    expect(first.manager.layoutDirty.peek()).toBe(true)
    await first.manager.saveLayout({ name: '绘图自动保存' })
    first.kernel.drawing.actions.setSelectedDrawingIds([])
    expect(first.manager.layoutDirty.peek()).toBe(false)
    first.kernel.drawing.actions.setDrawings([{ ...drawing, visible: false }])
    expect(first.manager.layoutDirty.peek()).toBe(true)
  } finally {
    unsubscribe()
    await first.manager.dispose()
    first.kernel.dispose()
  }
  const second = createManager()
  await second.manager.initialize()
  const unsubscribeSecond = subscribeDrawingAutoSave(second)
  try {
    expect(second.kernel.drawing.readonly.drawings.peek()).toEqual([
      { ...createDrawing(), visible: false },
    ])
    second.kernel.drawing.actions.clearDrawings()
    expect(second.manager.layoutDirty.peek()).toBe(true)
  } finally {
    unsubscribeSecond()
    await second.manager.dispose()
    second.kernel.dispose()
  }
  const final = createManager()
  try {
    await final.manager.initialize()
    expect(final.kernel.drawing.readonly.drawings.peek()).toEqual([])
  } finally {
    await final.manager.dispose()
    final.kernel.dispose()
  }
})

it('保存和切换布局，保留设备偏好，复制与重命名不改变当前图表', async () => {
  const { kernel, manager } = createManager()
  try {
    await manager.initialize()
    kernel.settings.actions.patch({ theme: 'dark', marketDataCacheMaxMiB: 200 })
    const dark = await manager.saveLayout({ name: '深色' })
    const copy = await manager.duplicateLayout({ id: dark, name: '副本' })
    await manager.renameLayout({ id: copy, name: '工作布局' })
    expect(manager.activeLayoutId.peek()).toBe(dark)
    const created = await manager.createLayout({ name: '新布局' })
    expect(kernel.settings.readonly.settings.peek().marketDataCacheMaxMiB).toBe(200)
    await manager.switchLayout({ id: copy })
    expect(kernel.settings.readonly.settings.peek().theme).toBe('dark')
    // 切换活动文档不改变列表顺序，选中项停留在原位置。
    expect(manager.layouts.peek().map((layout) => layout.id)).toEqual([
      'default',
      dark,
      copy,
      created,
    ])
    expect(manager.activeLayoutId.peek()).toBe(copy)
    expect(kernel.exportLayout().settings).not.toHaveProperty('marketDataCacheMaxMiB')
    await expect(manager.deleteLayout({ id: 'default' })).rejects.toThrow()
    await expect(manager.deleteLayout({ id: copy })).rejects.toThrow()
    await manager.deleteLayout({ id: dark })
  } finally {
    await manager.dispose()
    kernel.dispose()
  }
})

it('自动保存补写最后一次变更，重新打开恢复活动布局和列表顺序', async () => {
  const { kernel, manager } = createManager()
  await manager.initialize()
  const id = await manager.saveLayout({ name: '常用布局' })
  kernel.settings.actions.patch({ theme: 'dark' })
  manager.scheduleAutoSave()
  expect(manager.layoutDirty.peek()).toBe(true)
  await manager.dispose()
  kernel.dispose()

  const restored = createManager()
  try {
    await restored.manager.initialize()
    expect(restored.manager.activeLayoutId.peek()).toBe(id)
    expect(restored.manager.layouts.peek().map((layout) => layout.id)).toEqual(['default', id])
    expect(restored.kernel.settings.readonly.settings.peek().theme).toBe('dark')
    await restored.manager.setLayoutAutoSave({ enabled: false })
    restored.kernel.settings.actions.patch({ theme: 'light' })
    restored.manager.scheduleAutoSave()
    await restored.manager.dispose()
  } finally {
    restored.kernel.dispose()
  }

  const final = createManager()
  try {
    await final.manager.initialize()
    expect(final.manager.layoutAutoSave.peek()).toBe(false)
    expect(final.kernel.settings.readonly.settings.peek().theme).toBe('dark')
  } finally {
    await final.manager.dispose()
    final.kernel.dispose()
  }
})

it('当前品种的完整路由、周期和复权随布局落盘，重新打开交给恢复入口', async () => {
  const symbol: SymbolSpec = {
    id: 'NASDAQ:AAPL',
    symbol: 'AAPL',
    market: 'US',
    exchange: 'NASDAQ',
    source: 'fixture',
    period: 'daily',
    adjust: 'splits',
    params: { exchange: 'NASDAQ' },
    instrument: {
      id: 'NASDAQ:AAPL',
      sourceId: 'fixture',
      symbol: 'AAPL',
      name: 'Apple',
      assetClass: 'stock',
      exchange: 'NASDAQ',
      sessionId: 'US',
      providerRef: { exchange: 'NASDAQ' },
      capabilities: { bars: { periods: ['daily'], adjustments: ['splits'] } },
    },
  }
  const first = createManager()
  await first.manager.initialize()
  first.kernel.dataManager.actions.setCurrentSpec(symbol)
  const snapshot = first.kernel.exportLayout()
  expect(snapshot.currentSymbol).toEqual(symbol)
  expect(snapshot.currentSymbol).not.toBe(symbol)
  const id = await first.manager.saveLayout({ name: 'Apple 日线' })
  // 品种切换也会触发自动保存；这里直接调用调度入口以隔离行情网络请求。
  first.kernel.dataManager.actions.setCurrentSpec({ ...symbol, period: '60min', adjust: 'none' })
  first.manager.scheduleAutoSave()
  expect(first.manager.layoutDirty.peek()).toBe(true)
  await first.manager.dispose()
  first.kernel.dispose()

  const restoredKernel = createTestChartStateKernel()
  let restoredSymbol: SymbolSpec | null | undefined
  const restored = new LayoutManager({
    exportLayout: () => restoredKernel.exportLayout(),
    createLayout: () => restoredKernel.createLayout(),
    applyLayout: (document) => {
      restoredSymbol = document.currentSymbol
      restoredKernel.applyLayout(document)
    },
  })
  try {
    await restored.initialize()
    expect(restored.activeLayoutId.peek()).toBe(id)
    expect(restoredSymbol).toEqual({ ...symbol, period: '60min', adjust: 'none' })
  } finally {
    await restored.dispose()
    restoredKernel.dispose()
  }
})

it('视口快照随布局文档持久化，切换到该布局时恢复', async () => {
  const { kernel, manager } = createManager()
  try {
    await manager.initialize()
    const key = 'US:AAPL:daily:none:Kline'
    const snapshot = { anchorTimestamp: 1_700_000_000_000, anchorOffsetPx: 24, zoomLevel: 9 }
    kernel.dataManager.actions.saveViewportSnapshot(key, snapshot)
    const id = await manager.saveLayout({ name: '带视口' })
    expect(manager.exportLayout().viewport).toEqual({ [key]: snapshot })

    // 模拟切换前视口内存态已被清空，切回该布局应从文档恢复。
    kernel.dataManager.actions.restoreViewportSnapshots({})
    await manager.switchLayout({ id })
    expect(kernel.dataManager.readonly.viewportSnapshots.peek()).toEqual({ [key]: snapshot })
  } finally {
    await manager.dispose()
    kernel.dispose()
  }
})

it('恢复与切换布局前先完成文档依赖准备，再原子写入状态', async () => {
  const kernel = createTestChartStateKernel({ initialSettings: { theme: 'light' } })
  const events: string[] = []
  /** 每次准备返回一个由用例显式放行的任务，并通知用例准备已开始。 */
  let started: Promise<() => void> = Promise.resolve(() => {})
  let onStart: (release: () => void) => void = () => {}
  const armPreparation = () => {
    started = new Promise((resolve) => {
      onStart = resolve
    })
  }
  const manager = new LayoutManager({
    exportLayout: () => kernel.exportLayout(),
    applyLayout: (document) => {
      events.push('apply')
      kernel.applyLayout(document)
    },
    createLayout: () => kernel.createLayout(),
    prepareLayout: () => {
      events.push('prepare')
      return new Promise<void>((resolve) =>
        onStart(() => {
          events.push('prepared')
          resolve()
        }),
      )
    },
  })
  try {
    await manager.initialize()
    const id = await manager.saveLayout({ name: '目标' })
    armPreparation()
    const switching = manager.switchLayout({ id })
    const releaseSwitch = await started
    // 准备未完成时不得写入任何状态。
    expect(events).toEqual(['prepare'])
    releaseSwitch()
    await switching
    expect(events).toEqual(['prepare', 'prepared', 'apply'])
    events.length = 0
    armPreparation()
    const applying = manager.applyLayout(kernel.exportLayout())
    const releaseApply = await started
    expect(events).toEqual(['prepare'])
    releaseApply()
    await applying
    expect(events).toEqual(['prepare', 'prepared', 'apply'])
  } finally {
    await manager.dispose()
    kernel.dispose()
  }
})
