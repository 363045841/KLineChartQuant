/** 用真实 IndexedDB 事务验证移交回滚、并发竞争和源窗口的过期操作。 */
import 'fake-indexeddb/auto'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useWorkspaceTabs } from './use-workspace-tabs'
import { openWorkspaceTabsStore } from './workspace-tabs-store'

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** 源、目标都走真实初始化入口，源工作区特意只有一个标签以覆盖空记录语义。 */
async function setup() {
  const source = useWorkspaceTabs('source')
  const target = useWorkspaceTabs('target')
  await source.restore([{ id: 'moved', spec: null }])
  await target.restore([{ id: 'target-tab', spec: null }])
  return { source, target }
}

it('初始化后即可接管，源端迟到的品种通知不复活标签，目标新建也不覆盖接管结果', async () => {
  const { source, target } = await setup()
  const changed = source.setSpec('moved', { symbol: 'SOLUSDT', market: 'binance' })
  const adopted = target.adopt('source', 'moved')
  const created = target.createTab()
  await changed
  expect(await adopted).toEqual({ adopted: true, sourceEmptied: true })
  await created
  await source.setSpec('moved', { symbol: 'BTCUSDT', market: 'binance' })
  expect(source.tabs.value).toEqual([])
  await target.reload()
  expect(target.tabs.value).toHaveLength(3)
  expect(target.tabs.value.find((tab) => tab.id === 'moved')?.spec?.symbol).toBe('SOLUSDT')
  expect(await openWorkspaceTabsStore('source').load()).toEqual({ tabs: [], activeTabId: '' })
  const reopened = useWorkspaceTabs('source')
  await reopened.restore(null)
  expect(reopened.tabs.value).toEqual([])
})

it('目标写入失败会回滚已经写入的源端，内存保持原样，后续重试可以成功', async () => {
  const { source, target } = await setup()
  const original = IDBObjectStore.prototype.put
  const failure = new DOMException('Disk full', 'QuotaExceededError')
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (key === 'workspace:target') throw failure
    return original.call(this, value, key)
  })
  await expect(target.adopt('source', 'moved')).rejects.toBe(failure)
  expect(source.tabs.value.map((tab) => tab.id)).toEqual(['moved'])
  expect(target.tabs.value.map((tab) => tab.id)).toEqual(['target-tab'])
  expect((await openWorkspaceTabsStore('source').load())?.tabs.map((tab) => tab.id)).toEqual([
    'moved',
  ])
  put.mockRestore()
  expect(await target.adopt('source', 'moved')).toEqual({ adopted: true, sourceEmptied: true })
})

it('两个目标竞争同一标签只能有一个成功，持久化中只存在一份标签', async () => {
  const { target } = await setup()
  const other = useWorkspaceTabs('other')
  await other.restore([{ id: 'other-tab', spec: null }])
  const results = await Promise.all([
    target.adopt('source', 'moved'),
    other.adopt('source', 'moved'),
  ])
  expect(results.filter((result) => result.adopted)).toHaveLength(1)
  const snapshots = await Promise.all(
    ['source', 'target', 'other'].map((id) => openWorkspaceTabsStore(id).load()),
  )
  expect(
    snapshots.flatMap((snapshot) => snapshot?.tabs ?? []).filter((tab) => tab.id === 'moved'),
  ).toHaveLength(1)
})

it('源工作区保留其他标签时同步活动身份，目标按落点插入并切换到移交标签', async () => {
  const source = useWorkspaceTabs('source')
  const target = useWorkspaceTabs('target')
  await source.restore([
    { id: 'stay', spec: null },
    { id: 'moved', spec: null },
  ])
  await source.activate('moved')
  await target.restore([{ id: 'target-tab', spec: null }])
  expect(await target.adopt('source', 'moved', { id: 'target-tab', placement: 'before' })).toEqual({
    adopted: true,
    sourceEmptied: false,
  })
  await source.reload()
  expect(source.tabs.value.map((tab) => tab.id)).toEqual(['stay'])
  expect(source.activeTabId.value).toBe('stay')
  expect(target.tabs.value.map((tab) => tab.id)).toEqual(['moved', 'target-tab'])
  expect(target.activeTabId.value).toBe('moved')
})
