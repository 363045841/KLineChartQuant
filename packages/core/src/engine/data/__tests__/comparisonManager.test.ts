/** ComparisonManager 单元测试：只投影行情服务提供的比较序列。 */
import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '@/data/symbolSpec.js'
import type { DataChange } from '@/data/buffer/types'
import { DATA_CHANGE_KINDS } from '@/data/buffer/types'
import type { BarsSeries } from '@/data/service/index'
import { OLDER_DATA_STATUS } from '@/data/provider/types'
import { createSignal } from '@/foundation/reactivity/signal'
import type { KLineData } from '@/foundation/types/price'
import { ComparisonManager } from '../comparisonManager'
import { makeSymbolSpec } from './helpers/symbolSpecFixture'

/** 构造一个只读序列替身；用例只关心订阅与释放。 */
function createSeries(spec: SymbolSpec): BarsSeries {
  const data = createSignal<DataChange<KLineData>>({
    data: [],
    origin: 0,
    kind: DATA_CHANGE_KINDS.replace,
    start: 0,
    end: 0,
  })
  return {
    data,
    loading: createSignal(false),
    lastError: createSignal<string | null>(null),
    loadedTimeRange: null,
    olderData: OLDER_DATA_STATUS.UNKNOWN,
    timezone: 'UTC',
    instrument: spec.instrument,
    capabilities: null,
    getRawData: () => [],
    loadOlder: async () => 'exhausted',
    dispose: () => {},
  }
}

/** 构造只记录差异的比较环境。 */
function createHarness() {
  let specs: ReadonlyArray<SymbolSpec> = []
  const acquired = new Map<string, BarsSeries>()
  const acquire = vi.fn((spec: SymbolSpec) => {
    const id = spec.instrument.id
    const existing = acquired.get(id)
    if (existing) return existing
    const base = createSeries(spec)
    const series: BarsSeries = {
      ...base,
      dispose: () => {
        acquired.delete(id)
        base.dispose()
      },
    }
    acquired.set(id, series)
    return series
  })
  const setLoading = vi.fn()
  const manager = new ComparisonManager({
    acquire,
    scheduleDraw: vi.fn(),
    getSpecs: () => specs,
    setLoading,
  })
  return {
    manager,
    acquire,
    setLoading,
    acquired,
    setSpecs(next: ReadonlyArray<SymbolSpec>) {
      specs = next
    },
  }
}

/** 构造带市场与会话的品种；同一代码可跨市场、来源与周期并存。 */
function spec(
  symbol: string,
  options: { market?: string; exchange?: string; source?: string; period?: string } = {},
): SymbolSpec {
  return makeSymbolSpec({ symbol, ...options })
}

describe('ComparisonManager runtime projection', () => {
  it('reads specs from the injected reader without a local shadow', () => {
    const harness = createHarness()
    const first = spec('A', { source: 'custom' })
    harness.setSpecs([first])
    expect(harness.manager.specs).toEqual([first])

    harness.setSpecs([spec('B', { source: 'custom', period: 'weekly' })])
    expect(harness.manager.specs[0]?.instrument.symbol).toBe('B')
  })

  it('acquires one series per comparison across repeated reconciles', () => {
    const harness = createHarness()
    harness.setSpecs([spec('A', { source: 'custom' })])

    harness.manager.reconcile()
    harness.manager.reconcile()

    expect(harness.acquire).toHaveBeenCalledTimes(1)
  })

  it('keeps the same symbol isolated by market, source and period', () => {
    const harness = createHarness()
    harness.setSpecs([
      spec('000001', { market: 'CN', exchange: 'SH', source: 'gotdx' }),
      spec('000001', { market: 'CN', exchange: 'SH', source: 'baostock' }),
      spec('000001', { market: 'HK', exchange: 'HKEX', source: 'gotdx', period: 'weekly' }),
    ])

    harness.manager.reconcile()

    expect(harness.acquire).toHaveBeenCalledTimes(3)
    expect(harness.acquired.size).toBe(3)
  })

  it('disposes removed comparison series', () => {
    const harness = createHarness()
    const removed = spec('A', { source: 'custom' })
    const retained = spec('B', { source: 'custom' })
    harness.setSpecs([removed, retained])
    harness.manager.reconcile()

    harness.setSpecs([retained])
    harness.manager.reconcile()

    expect(harness.acquired.has(removed.instrument.id)).toBe(false)
    expect(harness.acquired.has(retained.instrument.id)).toBe(true)
  })

  it('clearAll disposes every series and clears loading', () => {
    const harness = createHarness()
    harness.setSpecs([spec('A', { source: 'custom' })])
    harness.manager.reconcile()

    harness.manager.clearAll()

    expect(harness.acquired.size).toBe(0)
    expect(harness.manager.specs).toEqual([spec('A', { source: 'custom' })])
    expect(harness.setLoading).toHaveBeenLastCalledWith(false)
  })
})
