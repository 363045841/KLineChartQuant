import { describe, expect, it } from 'vitest'

import {
  buildPaneScaleTypesFromSetting,
  resolveEffectiveAxisDisplay,
  resolvePriceScaleTypeSetting,
} from '../axisSettings'

describe('axisSettings', () => {
  it('keeps timeshare left percent and right price regardless of user settings', () => {
    expect(
      resolveEffectiveAxisDisplay('left', {
        period: 'timeshare',
        leftSetting: 'none',
        rightTypeSetting: 'none',
      }),
    ).toBe('percent')
    expect(
      resolveEffectiveAxisDisplay('right', {
        period: 'timeshare',
        leftSetting: 'percent',
        rightTypeSetting: 'percent',
      }),
    ).toBe('price')
  })

  it('keeps log as a right-axis type that still displays price labels', () => {
    expect(resolveEffectiveAxisDisplay('right', { rightTypeSetting: 'log' })).toBe('price')
    expect(resolvePriceScaleTypeSetting('log')).toBe('log')
  })

  it('forces comparison right axis to percent unless hidden', () => {
    expect(
      resolveEffectiveAxisDisplay('right', {
        comparisonActive: true,
        rightTypeSetting: 'linear',
      }),
    ).toBe('percent')
    expect(
      resolveEffectiveAxisDisplay('right', {
        comparisonActive: true,
        rightTypeSetting: 'none',
      }),
    ).toBe('none')
  })

  it.each(['percent', 'log'] as const)('maps %s setting only onto price panes', (setting) => {
    const types = buildPaneScaleTypesFromSetting(
      [
        { id: 'main', role: 'price' },
        { id: 'MACD_0', role: 'indicator' },
      ],
      setting,
    )
    expect(types.get('main')).toBe(setting)
    expect(types.get('MACD_0')).toBe('linear')
  })

  it('defaults unknown scale values to linear', () => {
    expect(resolvePriceScaleTypeSetting('none')).toBe('linear')
    expect(resolvePriceScaleTypeSetting('log')).toBe('log')
  })
})
