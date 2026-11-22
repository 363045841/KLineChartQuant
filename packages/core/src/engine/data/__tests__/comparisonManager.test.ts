/** ComparisonManager 单元测试：验证比较视图只投影 Repository 中的共享序列。 */
import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '@/controllers/types'
import { DataBuffer } from '@/data/buffer/impl/dataBuffer'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  SERIES_SELECTION_KIND,
  SeriesRepository,
  sourceFromSpec,
} from '@/data/buffer/impl/seriesRepository'
import { ComparisonManager } from '../comparisonManager'
import { makeSymbolSpec } from './helpers/symbolSpecFixture'

/** 将测试品种转换为日 K 选择。 */
function selectionForSpec(spec: SymbolSpec): BarsSelection {
  return {
    kind: SERIES_SELECTION_KIND.bars,
    instrumentKey: instrumentKeyFromSpec(spec),
    source: sourceFromSpec(spec),
    period: (spec.period ?? 'daily') as BarsSelection['period'],
    adjustment: (spec.adjust ?? 'none') as BarsSelection['adjustment'],
    barAggregation: 'original',
  }
}

/** 构造带市场与会话的品种；同一代码可跨市场、来源与周期并存。 */
function spec(
  symbol: string,
  options: { market?: string; exchange?: string; source?: string; period?: string } = {},
): SymbolSpec {
  return makeSymbolSpec({ symbol, ...options })
}

/** 创建使用真实 Repository 和 Buffer 的测试环境。 */
function createHarness() {
  let specs: ReadonlyArray<SymbolSpec> = []
  const repository = new SeriesRepository()
  const createBuffer = vi.fn(() => new DataBuffer())
  const loadBuffer = vi.fn((_spec: SymbolSpec, _selection: BarsSelection, buffer: DataBuffer) => {
    buffer.setSymbol(_spec)
  })
  const loadRange = vi.fn()
  const setLoading = vi.fn()
  const releaseSelection = vi.fn((selection: BarsSelection) => repository.delete(selection))
  const manager = new ComparisonManager(repository, {
    selectionForSpec,
    createBuffer,
    loadBuffer,
    loadRange,
    releaseSelection,
    scheduleDraw: vi.fn(),
    getSpecs: () => specs,
    setLoading,
  })
  return {
    manager,
    repository,
    createBuffer,
    loadBuffer,
    loadRange,
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
    const first = spec('A', { source: 'custom' })
    harness.setSpecs([first])
    expect(harness.manager.specs).toEqual([first])

    harness.setSpecs([spec('B', { source: 'custom', period: 'weekly' })])
    expect(harness.manager.specs[0]?.instrument.symbol).toBe('B')
  })

  it('reuses the Repository leaf when reconciliation runs repeatedly', () => {
    const harness = createHarness()
    const comparison = spec('A', { source: 'custom' })
    harness.setSpecs([comparison])

    harness.manager.reconcile()
    harness.manager.reconcile()

    expect(harness.createBuffer).toHaveBeenCalledTimes(1)
    expect(harness.repository.getBars(selectionForSpec(comparison))).toBeDefined()
  })

  it('keeps the same symbol isolated by market, source and period', () => {
    const harness = createHarness()
    const specs: SymbolSpec[] = [
      spec('000001', { market: 'CN', exchange: 'SH', source: 'gotdx' }),
      spec('000001', { market: 'CN', exchange: 'SH', source: 'baostock' }),
      spec('000001', { market: 'HK', exchange: 'HKEX', source: 'gotdx', period: 'weekly' }),
    ]
    harness.setSpecs(specs)

    harness.manager.reconcile()

    expect(harness.createBuffer).toHaveBeenCalledTimes(3)
    expect(
      new Set(specs.map((item) => harness.repository.getBars(selectionForSpec(item)))).size,
    ).toBe(3)
  })

  it('releases obsolete comparison leaves through the owner hook', () => {
    const harness = createHarness()
    const removed = spec('A', { source: 'custom' })
    const retained = spec('B', { source: 'custom' })
    harness.setSpecs([removed, retained])
    harness.manager.reconcile()

    harness.setSpecs([retained])
    harness.manager.reconcile()

    expect(harness.repository.getBars(selectionForSpec(removed))).toBeUndefined()
    expect(harness.repository.getBars(selectionForSpec(retained))).toBeDefined()
    expect(harness.releaseSelection).toHaveBeenCalledWith(selectionForSpec(removed))
  })

  it('clearAll releases runtime selections and clears loading', () => {
    const harness = createHarness()
    const comparison = spec('A', { source: 'custom' })
    harness.setSpecs([comparison])
    harness.manager.reconcile()

    harness.manager.clearAll()

    expect(harness.repository.getBars(selectionForSpec(comparison))).toBeUndefined()
    expect(harness.manager.specs).toEqual([comparison])
    expect(harness.setLoading).toHaveBeenLastCalledWith(false)
  })
})
