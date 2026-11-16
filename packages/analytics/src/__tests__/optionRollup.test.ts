/**
 * 期权滚上单元测试：边界快照、只处理已结束时段、幂等与断线补洞。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDayRows,
  buildHourRows,
  rollupCandidateDays,
  rollupOptionDays,
} from '../options/impl/rollup'
import { optionLayerStream } from '../options/impl/streams'
import { createDayShardStore } from '../storage/impl/dayShardStore'
import { createTempDir, makeSnapshotRow, removeTempDir } from './testUtils'

/** 一小时的毫秒数。 */
const HOUR_MS = 3_600_000

/** 固定「当前时刻」：2026-11-16T12:00:00Z，让「已结束的小时/天」成为确定事实。 */
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0)

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeTempDir(dir)
})

/**
 * 建一个临时数据根。
 *
 * @returns 数据根路径
 */
function tempRoot(): string {
  const dir = createTempDir()
  tempDirs.push(dir)
  return dir
}

/**
 * 写入一批分钟行。
 *
 * @param root 数据根
 * @param capturedAts 采集时刻列表
 */
function writeMinutes(root: string, capturedAts: readonly number[]): void {
  const store = createDayShardStore(root)
  store.append({
    stream: optionLayerStream('BTC', 'minute'),
    rows: capturedAts.map((capturedAt) => makeSnapshotRow({ capturedAt })),
    dayOf: (row) => row.capturedAt,
    dedupeKey: (row) => String(row.capturedAt),
  })
}

describe('小时与日行的边界快照', () => {
  it('每小时取最后一条分钟行，只保留已结束的小时', () => {
    const rows = [
      makeSnapshotRow({ capturedAt: NOW - 4 * HOUR_MS + 5 * 60_000 }),
      makeSnapshotRow({ capturedAt: NOW - 4 * HOUR_MS + 40 * 60_000 }),
      makeSnapshotRow({ capturedAt: NOW - 3 * HOUR_MS + 10 * 60_000 }),
      // 12:10 落在当前仍未结束的小时里
      makeSnapshotRow({ capturedAt: NOW + 10 * 60_000 }),
    ]
    const hourRows = buildHourRows(rows, NOW)
    expect(hourRows).toHaveLength(2)
    expect(hourRows[0]?.capturedAt).toBe(NOW - 4 * HOUR_MS + 40 * 60_000)
    expect(hourRows[0]?.aggregatedRows).toBe(2)
    expect(hourRows[1]?.capturedAt).toBe(NOW - 3 * HOUR_MS + 10 * 60_000)
    expect(hourRows[1]?.aggregatedRows).toBe(1)
  })

  it('每天取最后一条分钟行，未结束的当天不写日行', () => {
    const rows = [
      makeSnapshotRow({ capturedAt: Date.UTC(2026, 10, 15, 3, 0) }),
      makeSnapshotRow({ capturedAt: Date.UTC(2026, 10, 15, 23, 0) }),
      makeSnapshotRow({ capturedAt: NOW - 2 * HOUR_MS }),
    ]
    const dayRows = buildDayRows(rows, NOW)
    expect(dayRows).toHaveLength(1)
    expect(dayRows[0]?.capturedAt).toBe(Date.UTC(2026, 10, 15, 23, 0))
    expect(dayRows[0]?.aggregatedRows).toBe(2)
  })
})

describe('rollupOptionDays', () => {
  it('补齐两天的小时行与日行，重复执行不再新增', () => {
    const root = tempRoot()
    writeMinutes(root, [
      Date.UTC(2026, 10, 14, 0, 5),
      Date.UTC(2026, 10, 14, 0, 55),
      Date.UTC(2026, 10, 14, 5, 0),
      Date.UTC(2026, 10, 14, 23, 59),
      Date.UTC(2026, 10, 15, 1, 0),
      Date.UTC(2026, 10, 15, 23, 59),
      Date.UTC(2026, 10, 16, 1, 0),
    ])
    const store = createDayShardStore(root)

    const first = rollupOptionDays({ store, currency: 'BTC', now: () => NOW })
    expect(first.days).toEqual(['2026-11-14', '2026-11-15', '2026-11-16'])
    // 14 日 3 个小时有样本，15 日 2 个，16 日 1 个
    expect(first.hourRows).toBe(6)
    expect(first.dayRows).toBe(2)
    expect(store.listDays(optionLayerStream('BTC', 'hourly'))).toEqual([
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ])
    expect(store.listDays(optionLayerStream('BTC', 'daily'))).toEqual(['2026-11-14', '2026-11-15'])

    const second = rollupOptionDays({ store, currency: 'BTC', now: () => NOW })
    expect(second.hourRows).toBe(0)
    expect(second.dayRows).toBe(0)
    expect(second.skippedHourRows).toBe(6)
    expect(second.skippedDayRows).toBe(2)
  })

  it('断线后补洞：新结束的小时由下一轮补上', () => {
    const root = tempRoot()
    writeMinutes(root, [Date.UTC(2026, 10, 16, 9, 30)])
    const store = createDayShardStore(root)
    const first = rollupOptionDays({ store, currency: 'BTC', now: () => NOW })
    expect(first.hourRows).toBe(1)

    writeMinutes(root, [Date.UTC(2026, 10, 16, 11, 20)])
    const second = rollupOptionDays({ store, currency: 'BTC', now: () => NOW })
    expect(second.hourRows).toBe(1)
    const rows = store.read<{ capturedAt: number }>({
      stream: optionLayerStream('BTC', 'hourly'),
      day: '2026-11-16',
    })
    expect(rows.map((row) => row.capturedAt)).toEqual([
      Date.UTC(2026, 10, 16, 9, 30),
      Date.UTC(2026, 10, 16, 11, 20),
    ])
  })

  it('按 fromDay 限定重扫范围', () => {
    const root = tempRoot()
    writeMinutes(root, [Date.UTC(2026, 10, 13, 1, 0), Date.UTC(2026, 10, 15, 1, 0)])
    const store = createDayShardStore(root)
    expect(rollupCandidateDays(store, 'BTC', NOW)).toEqual(['2026-11-13', '2026-11-15'])
    const result = rollupOptionDays({
      store,
      currency: 'BTC',
      now: () => NOW,
      fromDay: '2026-11-15',
    })
    expect(result.days).toEqual(['2026-11-15'])
    expect(store.listDays(optionLayerStream('BTC', 'daily'))).toEqual(['2026-11-15'])
  })
})
