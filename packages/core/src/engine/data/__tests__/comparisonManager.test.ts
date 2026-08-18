/** ComparisonManager 单元测试：验证比较视图只投影 Repository 中的共享序列。 */
import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '../../../controllers/types'
import { DataBuffer } from '../../../data/buffer/dataBuffer'
import {
  SeriesRepository,
  instrumentKeyFromSpec,
  sourceIdFromSpec,
  type SeriesSelection,
} from '../../../data/buffer/seriesRepository'
import { ComparisonManager } from '../comparisonManager'

type BarsSelection = Extract<SeriesSelection, { kind: 'bars' }>

/** 将测试品种转换为日 K 选择。 */
function selectionForSpec(spec: SymbolSpec): BarsSelection {
  return {
    kind: 'bars',
    instrumentKey: instrumentKeyFromSpec(spec),
    sourceId: sourceIdFromSpec(spec),
    period: (spec.period ?? 'daily') as BarsSelection['period'],
    adjustment: (spec.adjust ?? 'none') as BarsSelection['adjustment'],
  }
}

/** 创建使用真实 Repository 和 Buffer 的测试环境。 */
function createHarness() {
  let specs: ReadonlyArray<SymbolSpec> = []
  const repository = new SeriesRepository()
  const createBuffer = vi.fn(() => {
    const buffer = new DataBuffer()
    buffer.setRequestFetch(null)
    return buffer
  })
  const setLoading = vi.fn()
  const releaseSelection = vi.fn((selection: BarsSelection) => repository.delete(selection))
  const manager = new ComparisonManager(repository, {
    selectionForSpec,
    createBuffer,
    releaseSelection,
    scheduleDraw: vi.fn(),
    getSpecs: () => specs,
    setLoading,
  })
  return {
    manager,
    repository,
    createBuffer,
    setLoading,
    releaseSelection,
    setSpecs(next: ReadonlyArray<SymbolSpec>) {
      specs = next
    },
  }
}

describe('ComparisonManager runtime projection', () => {
  it('reads specs from the injected kernel reader without a local shadow', () => {
    const harness = createHarness()
    harness.setSpecs([{ symbol: 'A', market: 'CN', source: 'custom', period: 'daily' }])
    expect(harness.manager.specs).toEqual([
      { symbol: 'A', market: 'CN', source: 'custom', period: 'daily' },
    ])

    harness.setSpecs([{ symbol: 'B', market: 'CN', source: 'custom', period: 'weekly' }])
    expect(harness.manager.specs[0]?.symbol).toBe('B')
  })

  it('reuses the Repository leaf when reconciliation runs repeatedly', () => {
    const harness = createHarness()
    const spec = { symbol: 'A', market: 'CN', source: 'custom', period: 'daily' }
    harness.setSpecs([spec])

    harness.manager.reconcile()
    harness.manager.reconcile()

    expect(harness.createBuffer).toHaveBeenCalledTimes(1)
    expect(harness.repository.getBars(selectionForSpec(spec))).toBeDefined()
  })

  it('does not reset a shared leaf when comparison request metadata differs', () => {
    const harness = createHarness()
    const mainSpec: SymbolSpec = {
      symbol: 'A',
      market: 'CN',
      source: 'custom',
      period: 'daily',
      incremental: false,
    }
    const shared = new DataBuffer()
    shared.setCurrentSpec(mainSpec)
    shared.setInlineData([{ timestamp: 1, open: 1, high: 1, low: 1, close: 1 }])
    harness.repository.getOrCreateBars(selectionForSpec(mainSpec), () => shared)
    harness.setSpecs([{ ...mainSpec, incremental: true, startDate: '2026-01-01' }])

    harness.manager.reconcile()

    expect(harness.createBuffer).not.toHaveBeenCalled()
    expect(shared.getRawData()).toHaveLength(1)
    expect(shared.currentSpec).toBe(mainSpec)
  })

  it('keeps the same symbol isolated by market, source and period', () => {
    const harness = createHarness()
    const specs: SymbolSpec[] = [
      { symbol: '000001', market: 'CN', exchange: 'SH', source: 'gotdx', period: 'daily' },
      { symbol: '000001', market: 'CN', exchange: 'SH', source: 'baostock', period: 'daily' },
      { symbol: '000001', market: 'HK', exchange: 'HKEX', source: 'gotdx', period: 'weekly' },
    ]
    harness.setSpecs(specs)

    harness.manager.reconcile()

    expect(harness.createBuffer).toHaveBeenCalledTimes(3)
    expect(
      new Set(specs.map((spec) => harness.repository.getBars(selectionForSpec(spec)))).size,
    ).toBe(3)
  })

  it('releases obsolete comparison leaves through the owner hook', () => {
    const harness = createHarness()
    const removed = { symbol: 'A', market: 'CN', source: 'custom', period: 'daily' }
    const retained = { symbol: 'B', market: 'CN', source: 'custom', period: 'daily' }
    harness.setSpecs([removed, retained])
    harness.manager.reconcile()

    harness.setSpecs([retained])
    harness.manager.reconcile()

    expect(harness.repository.getBars(selectionForSpec(removed))).toBeUndefined()
    expect(harness.repository.getBars(selectionForSpec(retained))).toBeDefined()
    expect(harness.releaseSelection).toHaveBeenCalledWith(selectionForSpec(removed))
  })

  it('sets inline data only for a desired comparison', () => {
    const harness = createHarness()
    expect(harness.manager.setData('A', [])).toBe(false)

    const spec = { symbol: 'A', market: 'CN', source: 'custom', period: 'daily' }
    harness.setSpecs([spec])
    expect(harness.manager.setData('A', [])).toBe(true)
    expect(harness.repository.getBars(selectionForSpec(spec))?.getRawData()).toEqual([])
  })

  it('clearAll releases runtime selections and clears loading', () => {
    const harness = createHarness()
    const spec = { symbol: 'A', market: 'CN', source: 'custom', period: 'daily' }
    harness.setSpecs([spec])
    harness.manager.reconcile()

    harness.manager.clearAll()

    expect(harness.repository.getBars(selectionForSpec(spec))).toBeUndefined()
    expect(harness.manager.specs).toEqual([spec])
    expect(harness.setLoading).toHaveBeenLastCalledWith(false)
  })
})
