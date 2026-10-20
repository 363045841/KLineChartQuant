/** 验证输出按脚本隔离、保留上限、清空和订阅释放。 */
import { type LogEvent, SCRIPT_OUTPUT_LIMIT } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { createScriptOutput } from '../impl/createScriptOutput.js'

/** 构造按 bar 索引递增的输出事件。 */
function event(barIndex: number): LogEvent {
  return { kind: 'log', level: 'log', time: barIndex, barIndex, message: String(barIndex) }
}

describe('脚本输出仓库', () => {
  it('按身份隔离，清空与取消订阅不会影响其他脚本', () => {
    const output = createScriptOutput()
    const received: Array<readonly LogEvent[]> = []
    const unsubscribe = output.source.subscribe('a', (events) => received.push(events))
    output.append('b', [event(1)])
    output.append('a', [event(2)])
    output.source.clear('a')
    unsubscribe()
    output.append('a', [event(3)])
    expect(received).toEqual([[], [event(2)], []])
    let history: readonly LogEvent[] = []
    output.source.subscribe('b', (events) => {
      history = events
    })
    expect(history).toEqual([event(1)])
  })

  it('仅保留最近的条目，新订阅读取历史，删除清空已有订阅', () => {
    const output = createScriptOutput()
    output.append(
      'a',
      Array.from({ length: SCRIPT_OUTPUT_LIMIT + 5 }, (_, index) => event(index)),
    )
    let history: readonly LogEvent[] = []
    output.source.subscribe('a', (events) => {
      history = events
    })
    expect(history).toHaveLength(SCRIPT_OUTPUT_LIMIT)
    expect(history[0]?.barIndex).toBe(5)
    expect(history.at(-1)?.barIndex).toBe(SCRIPT_OUTPUT_LIMIT + 4)
    output.remove('a')
    expect(history).toEqual([])
  })
})
