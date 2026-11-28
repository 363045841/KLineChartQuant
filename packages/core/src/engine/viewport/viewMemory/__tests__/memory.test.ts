/** 序列视口记忆：保存、读取、导入校验与容量上限。 */
import { describe, expect, it } from 'vitest'
import { makeSymbolSpec } from '@/engine/data/__tests__/helpers/symbolSpecFixture.js'
import { seriesViewportKey } from '../impl/key.js'
import { createSeriesViewportMemory } from '../impl/memory.js'

const daily = makeSymbolSpec({ symbol: 'AAA', period: 'daily', adjust: 'none' })
const hourly = makeSymbolSpec({ symbol: 'AAA', period: '60min', adjust: 'none' })
const range = { fromTime: 100, toTime: 300 }

describe('seriesViewportMemory', () => {
  it('saves and reads by series key', () => {
    const memory = createSeriesViewportMemory()
    memory.save(daily, range)
    expect(memory.get(daily)).toEqual(range)
    expect(memory.get(hourly)).toBeNull()
    expect(memory.exportMap()).toEqual({ [seriesViewportKey(daily)]: range })
  })

  it('ignores null saves', () => {
    const memory = createSeriesViewportMemory()
    memory.save(daily, range)
    memory.save(daily, null)
    expect(memory.get(daily)).toEqual(range)
  })

  it('drops invalid imported entries and keeps the newest 200 series', () => {
    const memory = createSeriesViewportMemory()
    memory.importMap({
      [seriesViewportKey(daily)]: { fromTime: 1, toTime: 2 },
      broken: { fromTime: 2, toTime: 1 },
    })
    expect(Object.keys(memory.exportMap())).toEqual([seriesViewportKey(daily)])

    for (let index = 0; index < 205; index += 1)
      memory.save(makeSymbolSpec({ symbol: `S${index}`, period: 'daily', adjust: 'none' }), range)
    expect(Object.keys(memory.exportMap())).toHaveLength(200)
  })
})
