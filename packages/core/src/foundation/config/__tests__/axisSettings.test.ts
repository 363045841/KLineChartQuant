import { describe, expect, it } from 'vitest'

import {
  buildPaneScaleTypesFromSetting,
  migrateAxisSettings,
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

  it('maps percent setting only onto price panes', () => {
    const types = buildPaneScaleTypesFromSetting(
      [
        { id: 'main', role: 'price' },
        { id: 'MACD_0', role: 'indicator' },
      ],
      'percent',
    )
    expect(types.get('main')).toBe('percent')
    expect(types.get('MACD_0')).toBe('linear')
  })

  it('migrates legacy rightAxisType without overwriting new keys', () => {
    expect(migrateAxisSettings({ rightAxisType: 'log', leftAxisType: 'percent' })).toEqual({
      mainRightAxisTypeSetting: 'log',
      mainLeftAxisDisplaySetting: 'percent',
    })
    expect(
      migrateAxisSettings({
        rightAxisType: 'log',
        mainRightAxisTypeSetting: 'none',
      }),
    ).toEqual({
      mainRightAxisTypeSetting: 'none',
    })
  })

  it('defaults unknown scale values to linear', () => {
    expect(resolvePriceScaleTypeSetting('none')).toBe('linear')
    expect(resolvePriceScaleTypeSetting('log')).toBe('log')
  })
})
