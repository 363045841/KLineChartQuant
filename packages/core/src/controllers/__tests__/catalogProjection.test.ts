/** 目录投影：指标与警报各有一份独立的选择器目录。 */
import { expect, it } from 'vitest'
import { createTestDefinitions } from '@/engine/indicators/__tests__/helpers/definitionsTestKit.js'
import { createAlertCatalog, createIndicatorCatalog, findIndicatorDefinition } from '../index.js'

it('projects alerts and indicators into their own selection catalogs', () => {
  const definitions = createTestDefinitions()
  definitions.register([
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
  expect(createIndicatorCatalog(definitions)().map((item) => item.label)).toEqual(['MA'])
  expect(findIndicatorDefinition(definitions, 'PriceCross')).toBeUndefined()
  expect(createAlertCatalog(definitions)()).toEqual([{
    id: 'PriceCross', label: 'PriceCross', name: 'PriceCross',
    inputs: [{ key: 'price', label: 'price', type: 'number', default: 100 }],
  }])
})
