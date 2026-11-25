import { afterEach, expect, it } from 'vitest'
import { clearIndicatorStoreForTest, registerIndicators } from '../../engine/indicators/pipeline/index.js'
import { alertCatalog, findIndicatorDefinition, indicatorCatalog } from '../index.js'

afterEach(clearIndicatorStoreForTest)

it('projects alerts and indicators into their own selection catalogs', () => {
  registerIndicators([
    {
      kind: 'descriptor',
      candidate: { key: 'MA', origin: 'third-party', identity: 'native' },
      descriptor: { kind: 'indicator', name: 'MA', displayName: 'MA', category: 'main', defaultPaneId: 'main' },
    },
    {
      kind: 'descriptor',
      candidate: { key: 'PriceCross', origin: 'third-party', identity: 'native' },
      descriptor: {
        kind: 'alert', frequency: 'per-bar', name: 'PriceCross', displayName: 'PriceCross',
        category: 'sub', defaultPaneId: 'sub_PriceCross', defaultInputs: { price: 100 },
      },
    },
  ])
  expect(indicatorCatalog().map((item) => item.label)).toEqual(['MA'])
  expect(findIndicatorDefinition('PriceCross')).toBeUndefined()
  expect(alertCatalog()).toEqual([{
    id: 'PriceCross', label: 'PriceCross', name: 'PriceCross',
    inputs: [{ key: 'price', label: 'price', type: 'number', default: 100 }],
  }])
})
