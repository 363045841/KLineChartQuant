/** 低周期完整性和两种执行后端一致性；覆盖缺口、边界、元组及真实随包指标输出。 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Bar, ScriptTimeContext } from '@363045841yyt/klinechart-plot-contracts'
import { BACKENDS } from '../../__tests__/backends.js'
import { requireValues } from '../../__tests__/marketData.js'
import { preloadQuickJS } from '../../quickjs/impl/runQuickJSScript.js'
import { timeValue } from '@363045841yyt/klinechart-plot-contracts'

const context: ScriptTimeContext = { period: 'daily', session: { timeZone: 'UTC', sessions: [{ open: 0, close: 1440 }], tradingDays: [0, 1, 2, 3, 4, 5, 6] } }
const day = Date.UTC(2026, 0, 5)
/** 简单行情让成交量总和与绘图坐标可以直接验证。 */
function bar(time: number, volume: number): Bar { return { time, open: 10, high: 12, low: 9, close: 11, volume } }
beforeAll(preloadQuickJS)

describe.each(BACKENDS)('$name lower timeframe', ({ prepare }) => {
  it('preserves every intrabar, tuple columns and empty chart slots', () => {
    const script = prepare(`defineIndicator({ name:'LTF', position:Position.Main, onBar(){
      const [t,v] = request.security_lower_tf(syminfo.tickerid,Timeframe.Minute1,()=>[time,volume] as const);
      plot.Line(v.reduce((sum,value)=>sum+value,0),'volume');
      plot.Line(t.length,'count');
    }});`)
    const main = [bar(day, 30), bar(day + 86400000, 0), bar(day + 172800000, 40)]
    const details = [bar(day, 10), bar(day + 60000, 20), bar(day + 172800000, 40)]
    const output = script.run(main, {}, { symbol: 'TEST', time: context, snapshots: [{ id: '0', bars: details }] })
    expect(requireValues(output, 'volume')).toEqual([30, 0, 40])
    expect(requireValues(output, 'count')).toEqual([2, 0, 1])
  })

  it.each(['svp', 'pvp'])('runs shipped %s on daily charts through drawings only', (name) => {
    const source = readFileSync(new URL(`../../../scripts/${name}.ts`, import.meta.url), 'utf8')
    const script = prepare(source)
    const details = [bar(day, 10), bar(day + 60000, 20), bar(day + 86400000, 40)]
    const output = script.run([bar(day, 30), bar(day + 86400000, 40)], { rowSize: 4, periodUnit: 'day' }, {
      symbol: 'TEST', time: context, snapshots: [{ id: '0', bars: details }],
    })
    expect(output.plots).toEqual([])
    const drawings = output.drawings ?? []
    expect(drawings.filter((drawing) => drawing.kind === 'trend-line')).toHaveLength(6)
    expect(drawings.some((drawing) => drawing.style.fill === '@token:volumeProfile.valueAreaUp')).toBe(true)
    expect(drawings.every((drawing) => drawing.xloc === 'bar_time')).toBe(true)
    const repeated = script.run([bar(day, 30), bar(day + 86400000, 40)], { rowSize: 4, periodUnit: 'day' }, { symbol: 'TEST', time: context, snapshots: [{ id: '0', bars: details }] })
    expect(repeated).toEqual(output)
    expect(script.run([]).drawings).toEqual([])
  })

  it('preserves profile volume ordering, POC, value-area bounds and parameter changes', () => {
    const script = prepare(readFileSync(new URL('../../../scripts/svp.ts', import.meta.url), 'utf8'))
    const details: Bar[] = [
      { time: day, open: 0, low: 0, high: 1, close: 1, volume: 70 },
      { time: day + 60000, open: 2, low: 1, high: 2, close: 1, volume: 30 },
    ]
    const market = { symbol: 'TEST', time: context, snapshots: [{ id: '0', bars: details }] }
    const result = script.run([bar(day, 100)], { rowSize: 4 }, market)
    const lines = result.drawings!.filter((drawing) => drawing.kind === 'trend-line')
    expect(lines.map((line) => line.anchors[0]!.price)).toEqual([0.25, 1.5, 0])
    const changed = script.run([bar(day, 100)], { rowSize: 4, showPoc: false }, market)
    expect(changed.drawings!.filter((drawing) => drawing.kind === 'trend-line')).toHaveLength(2)
    expect(() => script.run([bar(day, 100)], {}, { ...market, snapshots: [{ id: '0', bars: [] }] })).toThrow('没有可用的低周期')
  })

  it('rejects higher periods and keeps empty tuple columns when explicitly ignored', () => {
    const source = (ignore: boolean) => `defineIndicator({name:'InvalidLTF',position:Position.Main,onBar(){
      const [t,v]=request.security_lower_tf(syminfo.tickerid,Timeframe.Week,()=>[time,volume] as const,{ignore_invalid_timeframe:${ignore}});
      plot.Line(t.length+v.length,'count');
    }})`
    const market = { symbol: 'TEST', time: context, snapshots: [{ id: '0', bars: [bar(day, 1)] }] }
    expect(() => prepare(source(false)).run([bar(day, 1)], {}, market)).toThrow('不能高于主图')
    expect(requireValues(prepare(source(true)).run([bar(day, 1)], {}, market), 'count')).toEqual([0])
  })
})

describe('exchange clock', () => {
  it('honors DST, lunch breaks, holidays and early closing', () => {
    const clock: ScriptTimeContext = { period: '60', session: {
      timeZone: 'America/New_York', sessions: [{ open: 570, close: 960 }], tradingDays: [1, 2, 3, 4, 5],
      calendars: [{ year: 2026, closedDates: ['2026-01-01'], specialSessions: [{ date: '2026-11-27', sessions: [{ open: 570, close: 780 }] }] }],
    } }
    expect(timeValue(clock, 'market', '', Date.UTC(2026, 0, 5, 14, 30))).toBe(1)
    expect(timeValue(clock, 'market', '', Date.UTC(2026, 6, 6, 13, 30))).toBe(1)
    expect(timeValue(clock, 'market', '', Date.UTC(2026, 0, 1, 15))).toBe(0)
    expect(timeValue(clock, 'market', '', Date.UTC(2026, 10, 27, 19))).toBe(0)
    const cn: ScriptTimeContext = { period: '60', session: { timeZone: 'Asia/Shanghai', sessions: [{ open: 570, close: 690 }, { open: 780, close: 900 }] } }
    expect(timeValue(cn, 'market', '', Date.UTC(2026, 0, 5, 4))).toBe(0)
    expect(timeValue(cn, 'close', '60', Date.UTC(2026, 0, 5, 3))).toBe(Date.UTC(2026, 0, 5, 3, 30))
    const overnight: ScriptTimeContext = { period: '60', session: { timeZone: 'UTC', sessions: [{ open: 1080, close: 2460 }], tradingDays: [0, 1, 2, 3, 4] } }
    const sunday = Date.UTC(2026, 0, 4, 20)
    const monday = Date.UTC(2026, 0, 5, 8)
    expect(timeValue(overnight, 'tradingday', '', sunday)).toBe(Date.UTC(2026, 0, 5))
    expect(timeValue(overnight, 'open', '1D', sunday)).toBe(timeValue(overnight, 'open', '1D', monday))
    expect(timeValue(clock, 'open', '1D', Date.UTC(2026, 0, 5, 15), '0930-1600:23456')).toBe(Date.UTC(2026, 0, 5, 14, 30))
  })
})
