/**
 * 只读服务的期权契约测试：真实 HTTP 请求打到临时数据根上的服务。
 *
 * 用真实分片而不是替身存储：`step`/`days`/`limit` 与统计回退都依赖目录结构，
 * 替身存储验不到这一点。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { rollupOptionDays } from '../options/impl/rollup'
import { optionLayerStream } from '../options/impl/streams'
import { type OrderflowServerHandle, startOrderflowServer } from '../serve/impl/server'
import { createDayShardStore } from '../storage/impl/dayShardStore'
import { createTempDir, makeSnapshotRow, removeTempDir } from './testUtils'

/** 一小时的毫秒数。 */
const HOUR_MS = 3_600_000

/** 固定「当前时刻」：2026-11-16T12:00:00Z。 */
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0)

/** 六天的近月平值 IV，逐日抬升，便于断言分位。 */
const DAILY_IVS = [40, 45, 50, 55, 60, 65]

/** 每天采样的整点（UTC）。 */
const HOURS = [1, 7, 13, 19]

const tempDirs: string[] = []
const handles: OrderflowServerHandle[] = []

afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.close()
  for (const dir of tempDirs.splice(0)) removeTempDir(dir)
})

/**
 * 建临时数据根。
 *
 * @returns 数据根路径
 */
function tempRoot(): string {
  const dir = createTempDir()
  tempDirs.push(dir)
  return dir
}

/**
 * 写入六天的分钟行并滚上。
 *
 * @param root 数据根
 */
function writeSixDays(root: string): void {
  const store = createDayShardStore(root)
  const rows = DAILY_IVS.flatMap((atmIvPercent, dayIndex) =>
    HOURS.map((hour) =>
      makeSnapshotRow({
        capturedAt: Date.UTC(2026, 10, 10 + dayIndex, hour),
        atmIvPercent,
        spotIndex: 100 + dayIndex,
      }),
    ),
  )
  store.append({
    stream: optionLayerStream('BTC', 'minute'),
    rows,
    dayOf: (row) => row.capturedAt,
    dedupeKey: (row) => String(row.capturedAt),
  })
  rollupOptionDays({ store, currency: 'BTC', now: () => NOW })
}

/**
 * 起一个绑随机端口的服务。
 *
 * @param root 数据根
 * @param now 固定时钟毫秒
 * @returns 服务句柄
 */
async function serve(root: string, now: number = NOW): Promise<OrderflowServerHandle> {
  const handle = await startOrderflowServer({
    store: createDayShardStore(root),
    port: 0,
    now: () => now,
  })
  handles.push(handle)
  return handle
}

/**
 * 判断是否为普通对象。
 *
 * @param value 任意值
 * @returns 是否普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读 JSON 对象响应。
 *
 * @param port 端口
 * @param path 路径（含查询）
 * @returns 状态码与响应体
 */
async function getJson(
  port: number,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  const parsed: unknown = await response.json()
  if (!isRecord(parsed)) throw new Error(`响应不是 JSON 对象：${path}`)
  return { status: response.status, body: parsed }
}

/**
 * 读数值字段。
 *
 * @param source 响应体
 * @param key 字段名
 * @returns 数值
 */
function numberField(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number') throw new Error(`字段 ${key} 不是数字`)
  return value
}

/**
 * 读字符串字段。
 *
 * @param source 响应体
 * @param key 字段名
 * @returns 字符串
 */
function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string') throw new Error(`字段 ${key} 不是字符串`)
  return value
}

/**
 * 读布尔字段。
 *
 * @param source 响应体
 * @param key 字段名
 * @returns 布尔值
 */
function booleanField(source: Record<string, unknown>, key: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') throw new Error(`字段 ${key} 不是布尔值`)
  return value
}

/**
 * 读数组字段。
 *
 * @param source 响应体
 * @param key 字段名
 * @returns 数组
 */
function arrayField(source: Record<string, unknown>, key: string): readonly unknown[] {
  const value = source[key]
  if (!Array.isArray(value)) throw new Error(`字段 ${key} 不是数组`)
  return value
}

/**
 * 读一个窗口对象。
 *
 * @param value 数组元素
 * @returns 窗口响应体
 */
function windowOf(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('窗口不是对象')
  }
  return value
}

describe('/options/series', () => {
  it('默认读分钟层全部日分片', async () => {
    const root = tempRoot()
    writeSixDays(root)
    const handle = await serve(root)
    const { status, body } = await getJson(handle.port, '/options/series?currency=BTC')
    expect(status).toBe(200)
    expect(stringField(body, 'step')).toBe('minute')
    expect(arrayField(body, 'days')).toHaveLength(6)
    expect(numberField(body, 'rowCount')).toBe(24)
    expect(booleanField(body, 'truncated')).toBe(false)
    expect(arrayField(body, 'rows')).toHaveLength(24)
  })

  it('limit 从尾部截断并标记 truncated', async () => {
    const root = tempRoot()
    writeSixDays(root)
    const handle = await serve(root)
    const { body } = await getJson(handle.port, '/options/series?currency=BTC&limit=5')
    expect(numberField(body, 'rowCount')).toBe(5)
    expect(booleanField(body, 'truncated')).toBe(true)
    const rows = arrayField(body, 'rows')
    const last = rows[rows.length - 1]
    if (!isRecord(last)) throw new Error('行不是对象')
    expect(numberField(last, 'capturedAt')).toBe(Date.UTC(2026, 10, 15, 19))
  })

  it('step=day 读日行，days 只取最近分片', async () => {
    const root = tempRoot()
    writeSixDays(root)
    const handle = await serve(root)
    const day = await getJson(handle.port, '/options/series?currency=BTC&step=day&days=2')
    expect(stringField(day.body, 'step')).toBe('day')
    expect(arrayField(day.body, 'days')).toEqual(['2026-11-14', '2026-11-15'])
    expect(numberField(day.body, 'rowCount')).toBe(2)
    const hour = await getJson(handle.port, '/options/series?currency=BTC&step=hour&days=1')
    expect(arrayField(hour.body, 'days')).toEqual(['2026-11-15'])
    expect(numberField(hour.body, 'rowCount')).toBe(4)
  })

  it('参数非法返回 400', async () => {
    const root = tempRoot()
    writeSixDays(root)
    const handle = await serve(root)
    for (const path of [
      '/options/series',
      '/options/series?currency=btc',
      '/options/series?currency=BTC&step=week',
      '/options/series?currency=BTC&days=0',
      '/options/series?currency=BTC&limit=20001',
    ]) {
      const { status, body } = await getJson(handle.port, path)
      expect(status).toBe(400)
      expect(typeof body.error).toBe('string')
    }
  })
})

describe('/options/stats', () => {
  it('默认窗口读日行并给出分位', async () => {
    const root = tempRoot()
    writeSixDays(root)
    const handle = await serve(root)
    const { status, body } = await getJson(handle.port, '/options/stats?currency=BTC')
    expect(status).toBe(200)
    expect(stringField(body, 'source')).toBe('daily')
    expect(booleanField(body, 'stale')).toBe(false)
    expect(numberField(body, 'latestCapturedAt')).toBe(Date.UTC(2026, 10, 15, 19))
    expect(body.rv20).toBeNull()
    expect(body.vrp).toBeNull()
    expect(body.termStructure).toBeNull()
    expect(body.skew25dVolPoints).toBeNull()
    const windows = arrayField(body, 'windows')
    expect(windows).toHaveLength(3)
    const month = windowOf(windows[0])
    expect(numberField(month, 'windowDays')).toBe(30)
    expect(numberField(month, 'expectedDays')).toBe(30)
    expect(numberField(month, 'sampleDays')).toBe(6)
    expect(numberField(month, 'ivLatest')).toBe(65)
    expect(numberField(month, 'ivHigh')).toBe(65)
    expect(numberField(month, 'ivLow')).toBe(40)
    expect(numberField(month, 'ivRank')).toBe(100)
    expect(numberField(month, 'ivPercentile')).toBeCloseTo(83.33, 2)
  })

  it('期限结构与 25Δ 偏斜取最新样本行', async () => {
    const root = tempRoot()
    const store = createDayShardStore(root)
    const stream = optionLayerStream('BTC', 'daily')
    const lastIndex = DAILY_IVS.length - 1
    const rows = DAILY_IVS.map((atmIvPercent, index) =>
      makeSnapshotRow({
        capturedAt: Date.UTC(2026, 10, 10 + index, 23),
        atmIvPercent,
        expiries:
          index === lastIndex
            ? [
                {
                  expiryIso: '2026-11-20',
                  dteDays: 4,
                  atmIvPercent: 46.2,
                  putCallOiRatio: 0.64,
                  totalOpenInterest: 1200,
                },
                {
                  expiryIso: '2026-12-25',
                  dteDays: 38.8,
                  atmIvPercent: 38.25,
                  putCallOiRatio: 0.5,
                  totalOpenInterest: 800,
                },
              ]
            : [],
        skew25dVolPoints: index === lastIndex ? -5.07 : null,
        skew25dExpiryIso: index === lastIndex ? '2026-12-25' : null,
      }),
    )
    store.append({
      stream,
      rows,
      dayOf: (row) => row.capturedAt,
      dedupeKey: (row) => String(row.capturedAt),
    })
    const handle = await serve(root)
    const { body } = await getJson(handle.port, '/options/stats?currency=BTC&windows=30')
    expect(body.termStructure).toEqual([
      { expiryIso: '2026-11-20', dteDays: 4, atmIvPercent: 46.2 },
      { expiryIso: '2026-12-25', dteDays: 38.8, atmIvPercent: 38.25 },
    ])
    expect(body.skew25dVolPoints).toBe(-5.07)
    expect(body.skew25dExpiryIso).toBe('2026-12-25')
  })

  it('windows 保序、去重，并可跨年', async () => {
    const root = tempRoot()
    writeSixDays(root)
    const handle = await serve(root)
    const { body } = await getJson(handle.port, '/options/stats?currency=BTC&windows=7,30,7')
    const windows = arrayField(body, 'windows')
    expect(windows).toHaveLength(2)
    expect(numberField(windowOf(windows[0]), 'windowDays')).toBe(7)
    expect(numberField(windowOf(windows[1]), 'windowDays')).toBe(30)
    const year = await getJson(handle.port, '/options/stats?currency=BTC&windows=365')
    const yearWindow = windowOf(arrayField(year.body, 'windows')[0])
    expect(numberField(yearWindow, 'expectedDays')).toBe(365)
    expect(numberField(yearWindow, 'sampleDays')).toBe(6)
  })

  it('v1 扁平行与 v2 行一起进入统计', async () => {
    const root = tempRoot()
    const store = createDayShardStore(root)
    const stream = optionLayerStream('BTC', 'daily')
    // 前三天是旧采集器的扁平行（schemaVersion 1）
    const legacyRows: Record<string, unknown>[] = DAILY_IVS.slice(0, 3).map(
      (atmIvPercent, index) => ({
        schemaVersion: 1,
        currency: 'BTC',
        capturedAt: Date.UTC(2026, 10, 10 + index, 23),
        spotIndex: 100,
        nearTermAtmIvPercent: atmIvPercent,
      }),
    )
    store.append({
      stream,
      rows: legacyRows,
      dayOf: (row) => Number(row.capturedAt),
      dedupeKey: (row) => String(row.capturedAt),
    })
    // 后三天是 v2 行
    const modernRows = DAILY_IVS.slice(3).map((atmIvPercent, index) =>
      makeSnapshotRow({
        capturedAt: Date.UTC(2026, 10, 13 + index, 23),
        atmIvPercent,
        spotIndex: 100,
      }),
    )
    store.append({
      stream,
      rows: modernRows,
      dayOf: (row) => row.capturedAt,
      dedupeKey: (row) => String(row.capturedAt),
    })
    const handle = await serve(root)
    const { body } = await getJson(handle.port, '/options/stats?currency=BTC&windows=30')
    const month = windowOf(arrayField(body, 'windows')[0])
    expect(numberField(month, 'sampleDays')).toBe(6)
    expect(numberField(month, 'ivLow')).toBe(40)
    expect(numberField(month, 'ivHigh')).toBe(65)
    expect(numberField(month, 'ivRank')).toBe(100)
  })

  it('未知标的返回空统计，参数非法返回 400', async () => {
    const root = tempRoot()
    writeSixDays(root)
    const handle = await serve(root)
    const unknown = await getJson(handle.port, '/options/stats?currency=SOL')
    expect(unknown.status).toBe(200)
    expect(stringField(unknown.body, 'source')).toBe('none')
    expect(booleanField(unknown.body, 'stale')).toBe(true)
    expect(windowOf(arrayField(unknown.body, 'windows')[0]).ivRank).toBeNull()
    for (const path of [
      '/options/stats',
      '/options/stats?currency=BTC&windows=0',
      '/options/stats?currency=BTC&windows=30,90,365,1000',
      '/options/stats?currency=BTC&windows=abc',
    ]) {
      const { status } = await getJson(handle.port, path)
      expect(status).toBe(400)
    }
  })

  it('日行缺失时回退小时行，超过 26 小时标记 stale', async () => {
    const root = tempRoot()
    const store = createDayShardStore(root)
    const rows = DAILY_IVS.map((atmIvPercent, index) =>
      makeSnapshotRow({
        capturedAt: Date.UTC(2026, 10, 10 + index, 19),
        atmIvPercent,
      }),
    )
    store.append({
      stream: optionLayerStream('BTC', 'hourly'),
      rows,
      dayOf: (row) => row.capturedAt,
      dedupeKey: (row) => String(row.capturedAt),
    })
    const handle = await serve(root, NOW + 30 * HOUR_MS)
    const { body } = await getJson(handle.port, '/options/stats?currency=BTC')
    expect(stringField(body, 'source')).toBe('hourly')
    expect(booleanField(body, 'stale')).toBe(true)
    expect(numberField(windowOf(arrayField(body, 'windows')[0]), 'sampleDays')).toBe(6)
  })
})
