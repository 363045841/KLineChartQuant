/** 期权取数入口的双后端验收：数据只来自宿主载荷，两个运行时的结果必须一致。 */
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'
import { barsFromCloses, optionRow, optionSnapshot, requireValues } from '../../__tests__/marketData.js'

/** 一次运行的基准快照：两行，采集时刻升序。 */
const SNAPSHOT = optionSnapshot([optionRow(1_000, { spotIndex: 69000 }), optionRow(2_000, { spotIndex: 69500 })])

/** 覆盖四条查询路径的脚本：最新一条、全部历史、限定条数、标的不一致。 */
const QUERY_SOURCE = `defineIndicator({name:'OptionQuery',position:Position.Main,onBar(){
  const latest = option.levels()
  const all = option.history()
  const tail = option.history(1)
  const foreign = option.levels({ underlying: 'ETH' })
  plot.Line(latest === null ? null : latest.spotIndex, 'latest')
  plot.Line(all.length, 'count')
  plot.Line(tail.length === 0 ? null : tail[tail.length - 1].spotIndex, 'last')
  plot.Line(foreign === null ? -1 : 0, 'foreign')
}})`

describe.each(BACKENDS)('$name 期权取数', ({ prepare }) => {
  it('没有载荷数据时返回 null 与空数组，不报错', () => {
    const script = prepare(
      `defineIndicator({name:'NoOption',position:Position.Main,onBar(){
        plot.Line(option.levels() === null ? 1 : 0, 'missing')
        plot.Line(option.history().length, 'count')
      }})`,
    )
    const result = script.run(barsFromCloses([1, 2]), {}, { symbol: 'BTCUSDT', snapshots: [] })
    expect(requireValues(result, 'missing')).toEqual([1, 1])
    expect(requireValues(result, 'count')).toEqual([0, 0])
  })

  it('按采集时刻取最新一行，history 保持升序并可限定条数', () => {
    const script = prepare(QUERY_SOURCE)
    const result = script.run(barsFromCloses([1, 2]), {}, {
      symbol: 'BTCUSDT',
      snapshots: [],
      optionLevels: SNAPSHOT,
    })
    expect(requireValues(result, 'latest')).toEqual([69500, 69500])
    expect(requireValues(result, 'count')).toEqual([2, 2])
    expect(requireValues(result, 'last')).toEqual([69500, 69500])
    // 标的与本次载荷不一致时返回 null，不跨标的猜测。
    expect(requireValues(result, 'foreign')).toEqual([-1, -1])
  })

  it('保留 NaN：缺值不能被 JSON 静默变成 null', () => {
    const script = prepare(
      `defineIndicator({name:'OptionNaN',position:Position.Main,onBar(){
        const latest = option.levels()
        plot.Line(latest !== null && Number.isNaN(latest.maxPainUsd) ? 1 : 0, 'nan')
      }})`,
    )
    const result = script.run(barsFromCloses([1]), {}, {
      symbol: 'BTCUSDT',
      snapshots: [],
      optionLevels: optionSnapshot([optionRow(1_000, { maxPainUsd: Number.NaN })]),
    })
    expect(requireValues(result, 'nan')).toEqual([1])
  })

  it('limit 不是正整数时在入口拒绝', () => {
    expect(() =>
      prepare(`defineIndicator({name:'OptionBadLimit',position:Position.Main,onBar(){
        option.history(0)
      }})`).run(barsFromCloses([1]), {}, {
        symbol: 'BTCUSDT',
        snapshots: [],
        optionLevels: SNAPSHOT,
      }),
    ).toThrow('limit')
  })
})
