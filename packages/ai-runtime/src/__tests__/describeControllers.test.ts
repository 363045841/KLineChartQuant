import { describe, it, expect } from 'vitest'
import {
  describeVolumeProfileState,
  describeAnchoredVwap,
  describeFootprintLatestBar,
  describeAlerts,
} from '../describeControllers'

describe('describeVolumeProfileState', () => {
  it('handles null state with a clear summary', () => {
    const d = describeVolumeProfileState(null)
    expect(d.controllerId).toBe('volumeProfile')
    expect(d.summary).toMatch(/has not been computed/)
    expect(d.facts.ready).toBe(false)
  })

  it('produces a summary for populated state', () => {
    const d = describeVolumeProfileState({
      poc: 67_500,
      vah: 68_200,
      val: 66_800,
      totalVolume: 1000,
      vaVolume: 700,
    })
    const wordCount = d.summary.split(/\s+/).length
    expect(wordCount).toBeGreaterThanOrEqual(20)
    expect(wordCount).toBeLessThanOrEqual(100)
    expect(d.facts.poc).toBe(67_500)
    expect(d.facts.vaPercent).toBeCloseTo(70.0, 1)
  })
})

describe('describeAnchoredVwap', () => {
  it('reports zero anchors', () => {
    const d = describeAnchoredVwap([], 100)
    expect(d.facts.count).toBe(0)
  })

  it('flags overextension when price is above 1sigma upper', () => {
    const d = describeAnchoredVwap(
      [
        {
          label: 'Earnings Q1',
          barIndex: 100,
          vwap: 100,
          upper1: 105,
          lower1: 95,
          upper2: 110,
          lower2: 90,
        },
      ],
      120,
    )
    expect(d.summary).toMatch(/overextended/)
  })

  it('flags overextension below 1sigma lower', () => {
    const d = describeAnchoredVwap(
      [
        {
          label: 'Earnings Q1',
          barIndex: 100,
          vwap: 100,
          upper1: 105,
          lower1: 95,
          upper2: 110,
          lower2: 90,
        },
      ],
      80,
    )
    expect(d.summary).toMatch(/overextended/)
  })

  it('does NOT flag when price is inside the 1sigma band', () => {
    const d = describeAnchoredVwap(
      [
        {
          label: 'Earnings Q1',
          barIndex: 100,
          vwap: 100,
          upper1: 105,
          lower1: 95,
          upper2: 110,
          lower2: 90,
        },
      ],
      102,
    )
    expect(d.summary).not.toMatch(/overextended/)
  })
})

describe('describeFootprintLatestBar', () => {
  it('handles null bar', () => {
    const d = describeFootprintLatestBar(null, 0)
    expect(d.facts.ready).toBe(false)
  })

  it('labels buy-dominated bars', () => {
    const d = describeFootprintLatestBar(
      {
        barIndex: 42,
        delta: 250,
        totalVolume: 1000,
        imbalanceCount: 0,
        maxImbalanceRatio: 0,
      },
      500,
    )
    expect(d.facts.tone).toBe('buy-dominated')
  })

  it('labels sell-dominated bars', () => {
    const d = describeFootprintLatestBar(
      {
        barIndex: 42,
        delta: -250,
        totalVolume: 1000,
        imbalanceCount: 0,
        maxImbalanceRatio: 0,
      },
      -500,
    )
    expect(d.facts.tone).toBe('sell-dominated')
  })

  it('summarises imbalances correctly', () => {
    const d = describeFootprintLatestBar(
      {
        barIndex: 42,
        delta: 100,
        totalVolume: 1000,
        imbalanceCount: 3,
        maxImbalanceRatio: 5.5,
      },
      100,
    )
    expect(d.summary).toMatch(/3 diagonal imbalance/)
    expect(d.summary).toMatch(/5\.5×/)
  })
})

describe('describeAlerts', () => {
  it('zero rules', () => {
    const d = describeAlerts({
      rulesEnabled: 0,
      rulesTotal: 0,
      recentEventsCount: 0,
    })
    expect(d.summary).toBe('No alert rules configured.')
  })

  it('counts enabled vs total', () => {
    const d = describeAlerts({
      rulesEnabled: 3,
      rulesTotal: 5,
      recentEventsCount: 2,
    })
    expect(d.summary).toMatch(/3 of 5 alert rules/)
    expect(d.facts.recentEventsCount).toBe(2)
  })
})
