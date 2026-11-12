/**
 * 按天分片存储单元测试：写入、去重、跨天拆分、读回与滚动清理。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ANALYTICS_ERROR_CODES } from '../errors'
import { createDayShardStore } from '../storage/impl/dayShardStore'
import { createTempDir, expectAnalyticsError, removeTempDir } from './testUtils'

/** 记录形状。 */
interface Row {
  readonly id: string
  readonly at: number
  readonly value: number
}

/** 第 1 天：2026-11-10T00:00:00Z。 */
const DAY_ONE = Date.UTC(2026, 10, 10, 0, 0, 0)

/** 第 2 天：2026-11-11T12:00:00Z。 */
const DAY_TWO = Date.UTC(2026, 10, 11, 12, 0, 0)

/** 第 1 天记录。 */
const ROW_A: Row = { id: 'a', at: DAY_ONE, value: 1 }

/** 第 2 天记录。 */
const ROW_B: Row = { id: 'b', at: DAY_TWO, value: 2 }

describe('dayShardStore', () => {
  const dirs: string[] = []

  /** 建一个临时目录 + 存储实例。 */
  function createStore() {
    const dir = createTempDir()
    dirs.push(dir)
    return { dir, store: createDayShardStore(dir) }
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      removeTempDir(dir)
    }
  })

  it('写入后能按天读回', () => {
    const { store } = createStore()
    const appends = store.append<Row>({
      stream: 'options/aggregate/BTC',
      rows: [ROW_A],
      dayOf: (row) => row.at,
      dedupeKey: (row) => row.id,
    })

    expect(appends).toHaveLength(1)
    expect(appends[0].day).toBe('2026-11-10')
    expect(appends[0].appended).toBe(1)
    expect(store.read<Row>({ stream: 'options/aggregate/BTC', day: '2026-11-10' })).toEqual([ROW_A])
  })

  it('重复写入按去重键跳过', () => {
    const { store } = createStore()
    const request = {
      stream: 'options/aggregate/BTC' as const,
      rows: [ROW_A],
      dayOf: (row: Row) => row.at,
      dedupeKey: (row: Row) => row.id,
    }
    store.append<Row>(request)
    const second = store.append<Row>(request)

    expect(second[0].appended).toBe(0)
    expect(second[0].skipped).toBe(1)
    expect(store.read<Row>({ stream: request.stream, day: '2026-11-10' })).toHaveLength(1)
  })

  it('一次追加可以跨天拆分', () => {
    const { store } = createStore()
    const appends = store.append<Row>({
      stream: 'volume/BTCUSDT/1m',
      rows: [ROW_A, ROW_B],
      dayOf: (row) => row.at,
      dedupeKey: (row) => row.id,
    })

    expect(appends.map((append) => append.day)).toEqual(['2026-11-10', '2026-11-11'])
    expect(store.listDays('volume/BTCUSDT/1m')).toEqual(['2026-11-10', '2026-11-11'])
  })

  it('滚动清理只删除早于截止日的分片', () => {
    const { store } = createStore()
    store.append<Row>({
      stream: 'options/chain/BTC',
      rows: [ROW_A, ROW_B],
      dayOf: (row) => row.at,
      dedupeKey: (row) => row.id,
    })

    const removed = store.purgeBefore({ stream: 'options/chain/BTC', beforeDay: '2026-11-11' })
    expect(removed).toEqual(['2026-11-10'])
    expect(store.listDays('options/chain/BTC')).toEqual(['2026-11-11'])
  })

  it('读取不存在的天返回空数组', () => {
    const { store } = createStore()
    expect(store.read<Row>({ stream: 'options/aggregate/BTC', day: '2026-01-01' })).toEqual([])
  })

  it('流标识含路径穿越时拒绝', () => {
    const { store } = createStore()
    expectAnalyticsError(
      () => store.listDays('../evil'),
      ANALYTICS_ERROR_CODES.STORAGE_STREAM_INVALID,
    )
  })

  it('分片被破坏时读回报错而不是返回空', () => {
    const { dir, store } = createStore()
    const streamDir = join(dir, 'options', 'aggregate', 'BTC')
    mkdirSync(streamDir, { recursive: true })
    writeFileSync(join(streamDir, '2026-11-10.jsonl.gz'), 'not a gzip')

    expectAnalyticsError(
      () => store.read({ stream: 'options/aggregate/BTC', day: '2026-11-10' }),
      ANALYTICS_ERROR_CODES.STORAGE_READ_INVALID,
    )
  })
})
