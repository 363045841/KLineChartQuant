// 使用真实 Kernel 与 IndexedDB 替身验证布局归档、自动保存和最近使用顺序。
import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import type { SymbolSpec } from '../../../controllers/types.js'
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

it('保存和切换布局，保留设备偏好，复制与重命名不改变当前图表', async () => {
  const { kernel, manager } = createManager()
  try {
    await manager.initialize()
    kernel.settings.actions.patch({ theme: 'dark', marketDataCacheMaxMiB: 200 })
    const dark = await manager.saveLayout({ name: '深色' })
    const copy = await manager.duplicateLayout({ id: dark, name: '副本' })
    await manager.renameLayout({ id: copy, name: '工作布局' })
    expect(manager.activeLayoutId.peek()).toBe(dark)
    await manager.createLayout({ name: '新布局' })
    expect(kernel.settings.readonly.settings.peek().marketDataCacheMaxMiB).toBe(200)
    await manager.switchLayout({ id: copy })
    expect(kernel.settings.readonly.settings.peek().theme).toBe('dark')
    expect(manager.layouts.peek()[0]).toEqual({ id: copy, name: '工作布局' })
    expect(kernel.exportLayout().settings).not.toHaveProperty('marketDataCacheMaxMiB')
    await expect(manager.deleteLayout({ id: 'default' })).rejects.toThrow()
    await expect(manager.deleteLayout({ id: copy })).rejects.toThrow()
    await manager.deleteLayout({ id: dark })
  } finally {
    await manager.dispose()
    kernel.dispose()
  }
})

it('自动保存补写最后一次变更，重新打开恢复活动布局和最近顺序', async () => {
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
    expect(restored.manager.layouts.peek()[0]?.id).toBe(id)
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
