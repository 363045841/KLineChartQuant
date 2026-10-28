/** 用真实后端验证 console 跨 VM 的输出、运行隔离以及异常前日志保留。 */
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'
import { barsFromCloses } from '../../__tests__/marketData.js'
import type { LogEvent } from '../../contracts/output.js'

describe('脚本 console', () => {
  it.each(BACKENDS)('$name 输出级别、参数、对象和 bar 索引一致', ({ prepare }) => {
    const events: LogEvent[] = []
    const script = prepare(
      `
      console.log('top')
      defineIndicator({ name: 'Console', position: 'main', onBar() {
        console.log('price', close[0], { index: bar_index })
        console.info(null, undefined, true)
        console.warn('warning')
        console.error('error')
        console.debug('debug')
      } })`,
      [],
      (event) => events.push(event),
    )
    expect(events).toEqual([])
    script.requests()
    expect(events).toEqual([])
    script.run(barsFromCloses([10]))
    expect(events.map(({ level, barIndex, message }) => ({ level, barIndex, message }))).toEqual([
      { level: 'log', barIndex: -1, message: 'top' },
      { level: 'log', barIndex: 0, message: 'price 10 {"index":0}' },
      { level: 'info', barIndex: 0, message: 'null undefined true' },
      { level: 'warn', barIndex: 0, message: 'warning' },
      { level: 'error', barIndex: 0, message: 'error' },
      { level: 'debug', barIndex: 0, message: 'debug' },
    ])
    expect(events.every((event) => Number.isFinite(event.time))).toBe(true)
  })
  it.each(BACKENDS)('$name 抛错前的日志仍然可读', ({ prepare }) => {
    const events: LogEvent[] = []
    const script = prepare(
      `defineIndicator({ name: 'Failure', position: 'main', onBar() {
      console.log('before failure'); throw new Error('failed')
    } })`,
      [],
      (event) => events.push(event),
    )
    expect(() => script.run(barsFromCloses([10]))).toThrow('failed')
    expect(events.map((event) => event.message)).toEqual(['before failure'])
  })
})
