import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IndicatorScheduler } from '../scheduler'
import { MA_STATE_KEY, EMPTY_MA_STATE, type MARenderState } from '../maState'
import { BOLL_STATE_KEY, EMPTY_BOLL_STATE, type BOLLRenderState } from '../bollState'
import { EXPMA_STATE_KEY, EMPTY_EXPMA_STATE, type EXPMARenderState } from '../expmaState'
import { ENE_STATE_KEY, EMPTY_ENE_STATE, type ENERenderState } from '../eneState'
import { createRSIStateKey, EMPTY_RSI_STATE, type RSIRenderState } from '../rsiState'
import type { IndicatorMetadata } from '../indicatorMetadata'
import type { KLineData } from '@/types/price'
import type { PluginHost } from '@/plugin'

function applyMainResult(key: string): NonNullable<IndicatorMetadata['applyResult']> {
  return (host, state, _paneId) => {
    ;(host as PluginHost).setSharedState(key, state as any, 'indicator_scheduler')
  }
}

function applyRSIResult(host: any, state: any, paneId: string): void {
  host.setSharedState(createRSIStateKey(paneId), state as any, 'indicator_scheduler')
}

function registerTestIndicators(scheduler: IndicatorScheduler): void {
  const indicators: Array<IndicatorMetadata> = [
    { name: 'ma', displayName: 'MA', category: 'main' as const, stateKey: MA_STATE_KEY, defaultPaneId: 'main', rendererFactory: vi.fn() as any, applyResult: applyMainResult(MA_STATE_KEY) },
    { name: 'boll', displayName: 'BOLL', category: 'main' as const, stateKey: BOLL_STATE_KEY, defaultPaneId: 'main', rendererFactory: vi.fn() as any, applyResult: applyMainResult(BOLL_STATE_KEY) },
    { name: 'expma', displayName: 'EXPMA', category: 'main' as const, stateKey: EXPMA_STATE_KEY, defaultPaneId: 'main', rendererFactory: vi.fn() as any, applyResult: applyMainResult(EXPMA_STATE_KEY) },
    { name: 'ene', displayName: 'ENE', category: 'main' as const, stateKey: ENE_STATE_KEY, defaultPaneId: 'main', rendererFactory: vi.fn() as any, applyResult: applyMainResult(ENE_STATE_KEY) },
    { name: 'rsi', displayName: 'RSI', category: 'sub' as const, stateKey: createRSIStateKey('sub_RSI'), defaultPaneId: 'sub_RSI', rendererFactory: vi.fn() as any, paneIdField: 'rsiPaneId' as any, applyResult: applyRSIResult },
    { name: 'macd', displayName: 'MACD', category: 'sub' as const, stateKey: 'indicator:macd:sub_MACD', defaultPaneId: 'sub_MACD', rendererFactory: vi.fn() as any, paneIdField: 'macdPaneId' as any, applyResult: applyMainResult('indicator:macd:sub_MACD') },
    { name: 'volume', displayName: 'Volume', category: 'sub' as const, stateKey: 'indicator:volume:sub_Volume', defaultPaneId: 'sub_Volume', rendererFactory: vi.fn() as any, paneIdField: 'volumePaneId' as any, applyResult: applyMainResult('indicator:volume:sub_Volume') },
    { name: 'stoch', displayName: 'STOCH', category: 'sub' as const, stateKey: 'indicator:stoch:sub_STOCH', defaultPaneId: 'sub_STOCH', rendererFactory: vi.fn() as any, paneIdField: 'stochPaneId' as any, applyResult: applyMainResult('indicator:stoch:sub_STOCH') },
    { name: 'rsi2', displayName: 'RSI2', category: 'sub' as const, stateKey: createRSIStateKey('sub_RSI2'), defaultPaneId: 'sub_RSI2', rendererFactory: vi.fn() as any, paneIdField: 'rsi2PaneId' as any, applyResult: applyRSIResult },
    { name: 'wmsr', displayName: 'WMSR', category: 'sub' as const, stateKey: 'indicator:wmsr:sub_WMSR', defaultPaneId: 'sub_WMSR', rendererFactory: vi.fn() as any, paneIdField: 'wmsrPaneId' as any, applyResult: applyMainResult('indicator:wmsr:sub_WMSR') },
    { name: 'mom', displayName: 'MOM', category: 'sub' as const, stateKey: 'indicator:mom:sub_MOM', defaultPaneId: 'sub_MOM', rendererFactory: vi.fn() as any, paneIdField: 'momPaneId' as any, applyResult: applyMainResult('indicator:mom:sub_MOM') },
    { name: 'fastk', displayName: 'FASTK', category: 'sub' as const, stateKey: 'indicator:fastk:sub_FASTK', defaultPaneId: 'sub_FASTK', rendererFactory: vi.fn() as any, paneIdField: 'fastkPaneId' as any, applyResult: applyMainResult('indicator:fastk:sub_FASTK') },
    { name: 'cci', displayName: 'CCI', category: 'sub' as const, stateKey: 'indicator:cci:sub_CCI', defaultPaneId: 'sub_CCI', rendererFactory: vi.fn() as any, paneIdField: 'cciPaneId' as any, applyResult: applyMainResult('indicator:cci:sub_CCI') },
    { name: 'atr', displayName: 'ATR', category: 'sub' as const, stateKey: 'indicator:atr:sub_ATR', defaultPaneId: 'sub_ATR', rendererFactory: vi.fn() as any, paneIdField: 'atrPaneId' as any, applyResult: applyMainResult('indicator:atr:sub_ATR') },
    { name: 'kst', displayName: 'KST', category: 'sub' as const, stateKey: 'indicator:kst:sub_KST', defaultPaneId: 'sub_KST', rendererFactory: vi.fn() as any, paneIdField: 'kstPaneId' as any, applyResult: applyMainResult('indicator:kst:sub_KST') },
    { name: 'roc', displayName: 'ROC', category: 'sub' as const, stateKey: 'indicator:roc:sub_ROC', defaultPaneId: 'sub_ROC', rendererFactory: vi.fn() as any, paneIdField: 'rocPaneId' as any, applyResult: applyMainResult('indicator:roc:sub_ROC') },
    { name: 'trix', displayName: 'TRIX', category: 'sub' as const, stateKey: 'indicator:trix:sub_TRIX', defaultPaneId: 'sub_TRIX', rendererFactory: vi.fn() as any, paneIdField: 'trixPaneId' as any, applyResult: applyMainResult('indicator:trix:sub_TRIX') },
    { name: 'hv', displayName: 'HV', category: 'sub' as const, stateKey: 'indicator:hv:sub_HV', defaultPaneId: 'sub_HV', rendererFactory: vi.fn() as any, paneIdField: 'hvPaneId' as any, applyResult: applyMainResult('indicator:hv:sub_HV') },
    { name: 'parkinson', displayName: 'Parkinson', category: 'sub' as const, stateKey: 'indicator:parkinson:sub_Parkinson', defaultPaneId: 'sub_Parkinson', rendererFactory: vi.fn() as any, paneIdField: 'parkinsonPaneId' as any, applyResult: applyMainResult('indicator:parkinson:sub_Parkinson') },
    { name: 'chaikinVol', displayName: 'ChaikinVol', category: 'sub' as const, stateKey: 'indicator:chaikinVol:sub_ChaikinVol', defaultPaneId: 'sub_ChaikinVol', rendererFactory: vi.fn() as any, paneIdField: 'chaikinVolPaneId' as any, applyResult: applyMainResult('indicator:chaikinVol:sub_ChaikinVol') },
    { name: 'vma', displayName: 'VMA', category: 'sub' as const, stateKey: 'indicator:vma:sub_VMA', defaultPaneId: 'sub_VMA', rendererFactory: vi.fn() as any, paneIdField: 'vmaPaneId' as any, applyResult: applyMainResult('indicator:vma:sub_VMA') },
    { name: 'obv', displayName: 'OBV', category: 'sub' as const, stateKey: 'indicator:obv:sub_OBV', defaultPaneId: 'sub_OBV', rendererFactory: vi.fn() as any, paneIdField: 'obvPaneId' as any, applyResult: applyMainResult('indicator:obv:sub_OBV') },
    { name: 'pvt', displayName: 'PVT', category: 'sub' as const, stateKey: 'indicator:pvt:sub_PVT', defaultPaneId: 'sub_PVT', rendererFactory: vi.fn() as any, paneIdField: 'pvtPaneId' as any, applyResult: applyMainResult('indicator:pvt:sub_PVT') },
    { name: 'vwap', displayName: 'VWAP', category: 'sub' as const, stateKey: 'indicator:vwap:sub_VWAP', defaultPaneId: 'sub_VWAP', rendererFactory: vi.fn() as any, paneIdField: 'vwapPaneId' as any, applyResult: applyMainResult('indicator:vwap:sub_VWAP') },
    { name: 'cmf', displayName: 'CMF', category: 'sub' as const, stateKey: 'indicator:cmf:sub_CMF', defaultPaneId: 'sub_CMF', rendererFactory: vi.fn() as any, paneIdField: 'cmfPaneId' as any, applyResult: applyMainResult('indicator:cmf:sub_CMF') },
    { name: 'mfi', displayName: 'MFI', category: 'sub' as const, stateKey: 'indicator:mfi:sub_MFI', defaultPaneId: 'sub_MFI', rendererFactory: vi.fn() as any, paneIdField: 'mfiPaneId' as any, applyResult: applyMainResult('indicator:mfi:sub_MFI') },
    { name: 'sar', displayName: 'SAR', category: 'main' as const, stateKey: 'indicator:sar:main', defaultPaneId: 'main', rendererFactory: vi.fn() as any, applyResult: applyMainResult('indicator:sar:main') },
    { name: 'keltner', displayName: 'Keltner', category: 'main' as const, stateKey: 'indicator:keltner:main', defaultPaneId: 'main', rendererFactory: vi.fn() as any, applyResult: applyMainResult('indicator:keltner:main') },
  ]
  for (const meta of indicators) {
    scheduler.registerIndicator(meta)
  }
}

/**
 * 创建测试用的 K 线数据
 */
function createTestData(length: number, startPrice = 100): KLineData[] {
  return Array.from({ length }, (_, i) => ({
    timestamp: 1000000000000 + i * 60000,
    open: startPrice + i,
    high: startPrice + i + 1,
    low: startPrice + i - 1,
    close: startPrice + i,
    volume: 1000 + i * 100,
  }))
}

/**
 * 创建 mock PluginHost
 */
function createMockPluginHost(): PluginHost {
  const stateStore = new Map<string, unknown>()

  return {
    setSharedState: vi.fn((key: string, state: unknown, _owner: string) => {
      stateStore.set(key, state)
    }),
    getSharedState: vi.fn(<T>(key: string): T | undefined => {
      return stateStore.get(key) as T | undefined
    }),
    clearByOwner: vi.fn(),
    registerService: vi.fn(),
    getService: vi.fn(),
    getCanvas: vi.fn(),
    getMainPane: vi.fn(),
    getSubPane: vi.fn(),
    getAllSubPanes: vi.fn(),
    getTheme: vi.fn(),
    getStyles: vi.fn(),
    getBarStyles: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
  } as unknown as PluginHost
}

/**
 * 从 mock 调用中获取指定 key 的状态（最后一次）
 */
function getStateFromMockCalls<T>(mockHost: PluginHost, key: string): T | undefined {
  const calls = vi.mocked(mockHost.setSharedState).mock.calls
  // 从后往前找，获取最后一次写入该 key 的状态
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i]![0] === key) {
      return calls[i]![1] as T
    }
  }
  return undefined
}

describe('IndicatorScheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
    registerTestIndicators(scheduler)
    vi.mocked(mockHost.setSharedState).mockClear()
  })

  describe('initialization', () => {
    it('should not write to state store before first update', () => {
      expect(mockHost.setSharedState).not.toHaveBeenCalled()
    })

    it('should accept plugin host', () => {
      const newScheduler = new IndicatorScheduler()
      newScheduler.setPluginHost(mockHost)
      // Should not throw
      expect(() => newScheduler.recompute()).not.toThrow()
    })
  })

  describe('data update', () => {
    it('should write MARenderState to StateStore after update', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)

      expect(mockHost.setSharedState).toHaveBeenCalledWith(
        MA_STATE_KEY,
        expect.objectContaining({
          timestamp: expect.any(Number),
          series: expect.any(Object),
          enabledPeriods: expect.any(Array),
          visibleMin: expect.any(Number),
          visibleMax: expect.any(Number),
        }),
        expect.any(String)
      )
    })

    it('should calculate all default MA periods', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.enabledPeriods).toContain(5)
      expect(state!.enabledPeriods).toContain(10)
      expect(state!.enabledPeriods).toContain(20)
      expect(state!.enabledPeriods).toContain(30)
      expect(state!.enabledPeriods).toContain(60)
    })

    it('should set correct visibleMin and visibleMax for full range', () => {
      // Data: 100, 101, 102, ... 199
      const data = createTestData(100, 100)
      const visibleRange = { start: 60, end: 70 } // Viewing prices 160-169

      scheduler.update(data, visibleRange)

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      // MA5 of prices 160-169 should be between 156-169
      expect(state!.visibleMin).toBeLessThan(state!.visibleMax)
      expect(state!.visibleMax).toBeGreaterThan(150)
    })

    it('should handle empty data', () => {
      const data: KLineData[] = []
      const visibleRange = { start: 0, end: 0 }

      scheduler.update(data, visibleRange)

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.visibleMin).toBe(Infinity)
      expect(state!.visibleMax).toBe(-Infinity)
    })
  })

  describe('MA config update', () => {
    it('should update enabled periods based on config', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)

      // Disable some periods
      scheduler.updateMAConfig({
        ma5: true,
        ma10: false,
        ma20: true,
        ma30: false,
        ma60: false,
      })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.enabledPeriods).toContain(5)
      expect(state!.enabledPeriods).toContain(20)
      expect(state!.enabledPeriods).not.toContain(10)
      expect(state!.enabledPeriods).not.toContain(30)
      expect(state!.enabledPeriods).not.toContain(60)
    })

    it('should disable all periods when all flags are false', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)
      scheduler.updateMAConfig({
        ma5: false,
        ma10: false,
        ma20: false,
        ma30: false,
        ma60: false,
      })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.enabledPeriods).toHaveLength(0)
      expect(state!.visibleMin).toBe(Infinity)
      expect(state!.visibleMax).toBe(-Infinity)
    })
  })

  describe('visible range update (dual dirty flags)', () => {
    it('should recalculate extremes but not series on viewport change only', () => {
      // Mark sub-indicators active so their states get real extremes (not the EMPTY sentinels)
      scheduler.setActiveSubPaneProvider(() => [
        'sub_RSI', 'sub_CCI', 'sub_STOCH', 'sub_MOM', 'sub_WMSR', 'sub_KST', 'sub_FASTK', 'sub_MACD',
        'sub_ATR', 'sub_WMA', 'sub_DEMA', 'sub_TEMA', 'sub_HMA', 'sub_KAMA', 'sub_SAR',
        'sub_SuperTrend', 'sub_Keltner', 'sub_Donchian', 'sub_Ichimoku',
        'sub_ROC', 'sub_TRIX',
        'sub_HV', 'sub_Parkinson', 'sub_ChaikinVol',
        'sub_VMA', 'sub_OBV', 'sub_PVT',
        'sub_VWAP',
        'sub_CMF', 'sub_MFI',
        'sub_Pivot', 'sub_Fib', 'sub_Structure', 'sub_Zones', 'sub_VolumeProfile',
      ])

      const data = createTestData(100)

      // First update with full range
      scheduler.update(data, { start: 0, end: 100 })

      // Reset mock to track only the viewport change
      vi.mocked(mockHost.setSharedState).mockClear()

      // Update only viewport
      scheduler.updateVisibleRange({ start: 50, end: 60 })

      // updateVisibleStatesOnly writes the 20 sub-indicators that are both
      // registered and known to composeVisibleSubIndicatorStates.
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(20)

      // Inspect a sub-indicator (RSI) since main indicators are not rewritten on viewport-only updates
      const rsiKey = createRSIStateKey('sub_RSI')
      const state = getStateFromMockCalls<RSIRenderState>(mockHost, rsiKey)
      expect(state).toBeDefined()

      // Extremes should be recalculated for the new viewport (finite, not the Infinity sentinels)
      expect(Number.isFinite(state!.visibleMin)).toBe(true)
      expect(Number.isFinite(state!.visibleMax)).toBe(true)
      expect(state!.visibleMin).toBeLessThanOrEqual(state!.visibleMax)
    })

    it('should recalculate series on data change', () => {
      const data1 = createTestData(100)
      scheduler.update(data1, { start: 0, end: 100 })

      const data2 = createTestData(100, 200)
      scheduler.update(data2, { start: 0, end: 100 })

      // 26 registered indicators produce states × 2 data updates (1st triggers compute, 2nd retriggers with different data)
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(52)
    })
  })

  describe('recompute', () => {
    it('should force full recalculation', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      vi.mocked(mockHost.setSharedState).mockClear()

      scheduler.recompute()

      // Should write all 26 indicator states that have registered + known to composeRenderStates
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(26)
    })

    it('should recalculate with same data and range', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const firstState = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(firstState).toBeDefined()

      // Small delay to ensure different timestamp
      const start = Date.now()
      while (Date.now() < start + 2) { /* busy wait */ }

      scheduler.recompute()

      const secondState = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(secondState).toBeDefined()

      // Timestamps should be different (or at least not earlier)
      expect(secondState!.timestamp).toBeGreaterThanOrEqual(firstState!.timestamp)
    })
  })

  describe('series data structure', () => {
    it('should store series as Record with period keys', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      // Series should be a Record/object with string keys (numbers become strings in JS objects)
      expect(typeof state!.series).toBe('object')
      expect(state!.series[5]).toBeDefined()
      expect(Array.isArray(state!.series[5])).toBe(true)
      expect(state!.series[5]).toHaveLength(100)
    })

    it('should have undefined values for indices before period-1', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      // First 4 values of MA5 should be undefined
      expect(state!.series[5][0]).toBeUndefined()
      expect(state!.series[5][3]).toBeUndefined()
      expect(state!.series[5][4]).toBeDefined()
    })
  })
})

describe('EMPTY_MA_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_MA_STATE).toEqual({
      timestamp: 0,
      series: {},
      enabledPeriods: [],
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_MA_STATE.visibleMin).toBeGreaterThan(EMPTY_MA_STATE.visibleMax)
  })
})

describe('BOLL State in scheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
    registerTestIndicators(scheduler)
  })

  it('should write BOLLRenderState to StateStore after update', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.timestamp).toBeGreaterThan(0)
    expect(state!.series).toHaveLength(100)
    expect(state!.params.period).toBe(20)
    expect(state!.params.multiplier).toBe(2)
  })

  it('should have sparse BOLL series with undefined before period-1', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state).toBeDefined()

    // First 19 values should be undefined (period=20)
    for (let i = 0; i < 19; i++) {
      expect(state!.series[i]).toBeUndefined()
    }
    expect(state!.series[19]).toBeDefined()
  })

  it('should pass BOLL params including show flags', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state!.params.showUpper).toBe(true)
    expect(state!.params.showMiddle).toBe(true)
    expect(state!.params.showLower).toBe(true)
    expect(state!.params.showBand).toBe(true)
  })

  it('should update BOLL config via updateBOLLConfig', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    scheduler.updateBOLLConfig({ period: 10, multiplier: 3 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state!.params.period).toBe(10)
    expect(state!.params.multiplier).toBe(3)
  })

  it('should recalculate BOLL series when config changes', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const stateBefore = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    const seriesBefore = stateBefore!.series[19]

    scheduler.updateBOLLConfig({ period: 10 })

    const stateAfter = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    // With period=10, index 9 is first valid point, index 19 should differ
    expect(stateAfter!.series[9]).toBeDefined()
  })

  it('should handle empty data', () => {
    scheduler.update([], { start: 0, end: 0 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.visibleMin).toBe(Infinity)
    expect(state!.visibleMax).toBe(-Infinity)
  })
})

describe('EXPMA State in scheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
    registerTestIndicators(scheduler)
  })

  it('should write EXPMARenderState to StateStore after update', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.timestamp).toBeGreaterThan(0)
    expect(state!.series).toHaveLength(100)
    expect(state!.params.fastPeriod).toBe(12)
    expect(state!.params.slowPeriod).toBe(50)
  })

  it('should have dense EXPMA series from index 0', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state!.series[0]).toBeDefined()
    expect(state!.series[0]!.fast).toBeDefined()
    expect(state!.series[0]!.slow).toBeDefined()
  })

  it('should update EXPMA config via updateEXPMAConfig', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    scheduler.updateEXPMAConfig({ fastPeriod: 6, slowPeriod: 30 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state!.params.fastPeriod).toBe(6)
    expect(state!.params.slowPeriod).toBe(30)
  })

  it('should handle empty data', () => {
    scheduler.update([], { start: 0, end: 0 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.visibleMin).toBe(Infinity)
    expect(state!.visibleMax).toBe(-Infinity)
  })
})

describe('ENE State in scheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
    registerTestIndicators(scheduler)
  })

  it('should write ENERenderState to StateStore after update', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.timestamp).toBeGreaterThan(0)
    expect(state!.series).toHaveLength(100)
    expect(state!.params.period).toBe(10)
    expect(state!.params.deviation).toBe(11)
  })

  it('should have sparse ENE series with undefined before period-1', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state).toBeDefined()

    for (let i = 0; i < 9; i++) {
      expect(state!.series[i]).toBeUndefined()
    }
    expect(state!.series[9]).toBeDefined()
  })

  it('should update ENE config via updateENEConfig', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    scheduler.updateENEConfig({ period: 20, deviation: 8 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state!.params.period).toBe(20)
    expect(state!.params.deviation).toBe(8)
  })

  it('should handle empty data', () => {
    scheduler.update([], { start: 0, end: 0 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.visibleMin).toBe(Infinity)
    expect(state!.visibleMax).toBe(-Infinity)
  })
})

describe('Per-indicator dirty flags', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
    registerTestIndicators(scheduler)
  })

  it('updateBOLLConfig should not recalculate MA series', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    // Capture MA state after initial update
    const maStateBefore = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    const maSeriesBefore = maStateBefore!.series[5]

    // Reset mock to track new calls
    vi.mocked(mockHost.setSharedState).mockClear()

    scheduler.updateBOLLConfig({ period: 10 })

    // MA state should NOT be written (only BOLL state should be written)
    // because MA's dirty flags are not set
    const maStateAfter = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    expect(maStateAfter).toBeUndefined()
    // Verify BOLL state was written
    const bollStateAfter = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(bollStateAfter).toBeDefined()
    expect(bollStateAfter!.params.period).toBe(10)
  })

  it('updateEXPMAConfig should not recalculate MA series', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const maStateBefore = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    const maSeriesBefore = maStateBefore!.series[5]

    vi.mocked(mockHost.setSharedState).mockClear()

    scheduler.updateEXPMAConfig({ fastPeriod: 6 })

    // MA state should NOT be written (only EXPMA state should be written)
    const maStateAfter = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    expect(maStateAfter).toBeUndefined()
    // Verify EXPMA state was written
    const expmaStateAfter = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(expmaStateAfter).toBeDefined()
    expect(expmaStateAfter!.params.fastPeriod).toBe(6)
  })

  it('updateENEConfig should not recalculate MA series', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const maStateBefore = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    const maSeriesBefore = maStateBefore!.series[5]

    vi.mocked(mockHost.setSharedState).mockClear()

    scheduler.updateENEConfig({ period: 20 })

    // MA state should NOT be written (only ENE state should be written)
    const maStateAfter = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    expect(maStateAfter).toBeUndefined()
    // Verify ENE state was written
    const eneStateAfter = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(eneStateAfter).toBeDefined()
    expect(eneStateAfter!.params.period).toBe(20)
  })

  it('updateBOLLConfig should recalculate BOLL extremes', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const bollStateBefore = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)

    scheduler.updateBOLLConfig({ period: 10 })

    const bollStateAfter = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    // Extremes should be recalculated
    expect(bollStateAfter!.visibleMin).toBeLessThan(bollStateAfter!.visibleMax)
  })
})

describe('EMPTY_BOLL_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_BOLL_STATE).toEqual({
      timestamp: 0,
      series: [],
      params: {
        period: 20,
        multiplier: 2,
        showUpper: true,
        showMiddle: true,
        showLower: true,
        showBand: true,
      },
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_BOLL_STATE.visibleMin).toBeGreaterThan(EMPTY_BOLL_STATE.visibleMax)
  })
})

describe('EMPTY_EXPMA_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_EXPMA_STATE).toEqual({
      timestamp: 0,
      series: [],
      params: {
        fastPeriod: 12,
        slowPeriod: 50,
      },
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_EXPMA_STATE.visibleMin).toBeGreaterThan(EMPTY_EXPMA_STATE.visibleMax)
  })
})

describe('EMPTY_ENE_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_ENE_STATE).toEqual({
      timestamp: 0,
      series: [],
      params: {
        period: 10,
        deviation: 11,
      },
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_ENE_STATE.visibleMin).toBeGreaterThan(EMPTY_ENE_STATE.visibleMax)
  })
})

describe('RSI State in scheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
    registerTestIndicators(scheduler)
  })

  it('should write RSIRenderState to StateStore after update', () => {
    const data = createTestData(50)
    scheduler.update(data, { start: 0, end: 20 })

    const rsiKey = createRSIStateKey('sub_RSI')
    const setSharedState = mockHost.setSharedState as ReturnType<typeof vi.fn>
    const rsiCall = setSharedState.mock.calls.find((call: unknown[]) => call[0] === rsiKey)
    expect(rsiCall).toBeDefined()

    const rsiState = rsiCall?.[1] as RSIRenderState
    expect(rsiState.series).toBeDefined()
    expect(rsiState.enabledPeriods).toEqual([6, 12, 24])
    expect(rsiState.params.period1).toBe(6)
    expect(rsiState.params.period2).toBe(12)
    expect(rsiState.params.period3).toBe(24)
    expect(rsiState.valueMin).toBe(0)
    expect(rsiState.valueMax).toBe(100)
  })

  it('should have sparse RSI series (first period+1 entries undefined)', () => {
    const data = createTestData(50)
    scheduler.update(data, { start: 0, end: 30 })

    const rsiKey = createRSIStateKey('sub_RSI')
    const setSharedState = mockHost.setSharedState as ReturnType<typeof vi.fn>
    const rsiCall = setSharedState.mock.calls.find((call: unknown[]) => call[0] === rsiKey)
    const rsiState = rsiCall?.[1] as RSIRenderState

    // RSI(6): indices 0-5 should be undefined, index 6 should be valid
    expect(rsiState.series[6][0]).toBeUndefined()
    expect(rsiState.series[6][5]).toBeUndefined()
    expect(rsiState.series[6][6]).toBeDefined()
  })

  it('should pass RSI params including show flags', () => {
    scheduler.updateRSIConfig({ showRSI1: true, showRSI2: false, showRSI3: true }, 'sub_RSI')
    const data = createTestData(50)
    scheduler.update(data, { start: 0, end: 20 })

    const rsiKey = createRSIStateKey('sub_RSI')
    const setSharedState = mockHost.setSharedState as ReturnType<typeof vi.fn>
    const rsiCall = setSharedState.mock.calls.find((call: unknown[]) => call[0] === rsiKey)
    const rsiState = rsiCall?.[1] as RSIRenderState

    expect(rsiState.params.showRSI1).toBe(true)
    expect(rsiState.params.showRSI2).toBe(false)
    expect(rsiState.params.showRSI3).toBe(true)
    // Only RSI1 and RSI3 should be in series and enabledPeriods
    expect(rsiState.enabledPeriods).toContain(6)
    expect(rsiState.enabledPeriods).not.toContain(12)
    expect(rsiState.enabledPeriods).toContain(24)
  })

  it('should update RSI config via updateRSIConfig', () => {
    scheduler.updateRSIConfig({ period1: 10, period2: 20, period3: 30 }, 'sub_RSI')
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 50 })

    const rsiKey = createRSIStateKey('sub_RSI')
    const setSharedState = mockHost.setSharedState as ReturnType<typeof vi.fn>
    const rsiCall = setSharedState.mock.calls.find((call: unknown[]) => call[0] === rsiKey)
    const rsiState = rsiCall?.[1] as RSIRenderState

    expect(rsiState.params.period1).toBe(10)
    expect(rsiState.params.period2).toBe(20)
    expect(rsiState.params.period3).toBe(30)
  })

  it('should not recalculate MA series on RSI config change', () => {
    const data = createTestData(50)
    scheduler.update(data, { start: 0, end: 20 })

    // Get the MA state after first update
    const maStateBefore = (mockHost.setSharedState as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === MA_STATE_KEY
    )?.[1] as MARenderState

    // Update RSI config only
    scheduler.updateRSIConfig({ period1: 14 }, 'sub_RSI')

    // Get the MA state after RSI config update
    const maStateAfter = (mockHost.setSharedState as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === MA_STATE_KEY
    )?.[1] as MARenderState

    // MA series should remain the same reference (not recalculated)
    expect(maStateAfter.series).toBe(maStateBefore.series)
  })

  it('should use dynamic paneId in state key', () => {
    scheduler.updateRSIConfig({}, 'custom_RSI_pane')
    const data = createTestData(50)
    scheduler.update(data, { start: 0, end: 20 })

    const expectedKey = createRSIStateKey('custom_RSI_pane')
    const setSharedState = mockHost.setSharedState as ReturnType<typeof vi.fn>
    const rsiCall = setSharedState.mock.calls.find((call: unknown[]) => call[0] === expectedKey)
    expect(rsiCall).toBeDefined()
  })

  it('should have visibleMin=Infinity visibleMax=-Infinity when no data', () => {
    scheduler.update([], { start: 0, end: 0 })

    const rsiKey = createRSIStateKey('sub_RSI')
    const setSharedState = mockHost.setSharedState as ReturnType<typeof vi.fn>
    const rsiCall = setSharedState.mock.calls.find((call: unknown[]) => call[0] === rsiKey)
    const rsiState = rsiCall?.[1] as RSIRenderState

    expect(rsiState.visibleMin).toBe(Infinity)
    expect(rsiState.visibleMax).toBe(-Infinity)
  })
})

describe('EMPTY_RSI_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_RSI_STATE).toEqual({
      timestamp: 0,
      series: {},
      enabledPeriods: [],
      params: {
        period1: 6,
        period2: 12,
        period3: 24,
        showRSI1: true,
        showRSI2: true,
        showRSI3: true,
      },
      valueMin: 0,
      valueMax: 100,
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_RSI_STATE.visibleMin).toBeGreaterThan(EMPTY_RSI_STATE.visibleMax)
  })

  it('should have fixed valueMin and valueMax', () => {
    expect(EMPTY_RSI_STATE.valueMin).toBe(0)
    expect(EMPTY_RSI_STATE.valueMax).toBe(100)
  })
})
