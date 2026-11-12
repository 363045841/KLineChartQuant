/**
 * cloudtrade 历史迁移单元测试。
 *
 * 用临时目录构造最小 cloudtrade 数据集，验证：符号映射、按 ts 去重、非目标符号忽略、
 * 未知周期跳过、清单落盘与重复执行幂等。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateCloudtradeData } from '../migration/impl/migrate'
import {
  CLOUDTRADE_SAMPLING_NOTE,
  type LegacyOptionLevelRecord,
  type LegacyVolumeBarRecord,
} from '../migration/types'
import { createDayShardStore } from '../storage/impl/dayShardStore'
import { createTempDir, removeTempDir } from './testUtils'

/** 迁移时钟：2026-12-01T00:00:00Z。 */
const NOW = Date.UTC(2026, 11, 1, 0, 0, 0)

/**
 * 铺一个最小 cloudtrade 数据目录。
 *
 * @param home cloudtrade 根目录
 */
function writeCloudtradeFixture(home: string): void {
  mkdirSync(join(home, 'archive'), { recursive: true })

  const btcRecord = {
    symbol: 'BTCUSD',
    ts: '2026-10-02T18:17:46+00:00',
    src: '2026-10-02T18:16:07+00:00',
    gamma_flip: 84524.04,
    call_wall: 90000,
    put_wall: 85000,
    max_pain: 84000,
    spot: 89315.02,
  }
  const lines = [
    JSON.stringify(btcRecord),
    // 同一 ts 的重复写入：迁移必须去重。
    JSON.stringify(btcRecord),
    JSON.stringify({ ...btcRecord, ts: '2026-10-02T18:47:46+00:00' }),
    // 非目标符号：应被忽略。
    JSON.stringify({ symbol: 'XNGUSD', ts: '2026-10-02T18:17:46+00:00' }),
  ]
  writeFileSync(
    join(home, 'archive', 'option_levels_history_20261011.jsonl.gz'),
    gzipSync(Buffer.from(`${lines.join('\n')}\n`, 'utf8')),
  )

  const ethRecord = {
    symbol: 'ETHUSD',
    ts: '2026-10-03T01:00:00+00:00',
    src: null,
    gamma_flip: null,
    call_wall: 2200,
    put_wall: 2000,
    max_pain: 2100,
    spot: 2124.14,
  }
  writeFileSync(join(home, 'option_levels_history.jsonl'), `${JSON.stringify(ethRecord)}\n`, 'utf8')

  mkdirSync(join(home, 'volume'), { recursive: true })
  writeFileSync(
    join(home, 'volume', 'BTCUSD.json'),
    JSON.stringify({
      symbol: 'BTCUSD',
      binance_symbol: 'BTCUSDT',
      volume_rev: 3,
      intervals: {
        '1m': {
          bars: [
            [1786232040, 11.00825, 10.95818, 711693.084619],
            [1786232100, 0.97362, 0.72189, 46886.82216],
          ],
        },
        // 未知周期：应被跳过而不是报错。
        '7m': { bars: [[1, 1, 1, 1]] },
      },
      updated_at: 1794239139902,
    }),
    'utf8',
  )
  writeFileSync(
    join(home, 'volume', 'ETHUSD.json'),
    JSON.stringify({
      symbol: 'ETHUSD',
      binance_symbol: 'ETHUSDT',
      volume_rev: 3,
      intervals: {
        '1d': { bars: [[1794182400, 12246.55087, 6596.24878, 492145795.8219189]] },
      },
      updated_at: 1794239139902,
    }),
    'utf8',
  )
}

describe('migrateCloudtradeData', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      removeTempDir(dir)
    }
  })

  /** 建一套临时 cloudtrade 目录与输出目录。 */
  function createFixture() {
    const home = createTempDir('kcq-cloudtrade-')
    const root = createTempDir('kcq-analytics-')
    dirs.push(home, root)
    writeCloudtradeFixture(home)
    return { home, root }
  }

  it('导入期权聚合位与买卖量并写清单', () => {
    const { home, root } = createFixture()
    const result = migrateCloudtradeData({ rootDir: root, cloudtradeHome: home, now: () => NOW })

    expect(result.manifest.options.recordsImported).toBe(3)
    expect(result.manifest.options.duplicatesDropped).toBe(1)
    expect(result.manifest.options.skippedNonTargetRecords).toBe(1)
    expect(result.manifest.volume.barsImported).toBe(3)

    const btcCadence = result.manifest.options.cadence.find((item) => item.symbol === 'BTCUSD')
    expect(btcCadence?.uniqueSnapshots).toBe(2)
    expect(btcCadence?.firstDay).toBe('2026-10-02')
    expect(btcCadence?.gapMedianMinutes).toBe(30)
    expect(btcCadence?.gapMaxMinutes).toBe(30)

    const ethSeries = result.manifest.volume.series.find((item) => item.symbol === 'ETHUSDT')
    expect(ethSeries?.intervals.map((item) => item.interval)).toEqual(['1d'])
    const btcSeries = result.manifest.volume.series.find((item) => item.symbol === 'BTCUSDT')
    expect(btcSeries?.intervals.map((item) => item.interval)).toEqual(['1m'])

    expect(existsSync(result.manifestPath)).toBe(true)
    // 清单是给后续分析消费方看的，必须把采样口径写进文件本身。
    expect(readFileSync(result.manifestPath, 'utf8')).toContain(CLOUDTRADE_SAMPLING_NOTE)
  })

  it('迁移记录带来源标记与采样说明', () => {
    const { home, root } = createFixture()
    migrateCloudtradeData({ rootDir: root, cloudtradeHome: home, now: () => NOW })

    const store = createDayShardStore(root)
    const optionRows = store.read<LegacyOptionLevelRecord>({
      stream: 'legacy/options-levels/BTCUSD',
      day: '2026-10-02',
    })
    expect(optionRows).toHaveLength(2)
    expect(optionRows[0].currency).toBe('BTC')
    expect(optionRows[0].gammaFlipUsd).toBe(84524.04)
    expect(optionRows[0].samplingNote).toBe(CLOUDTRADE_SAMPLING_NOTE)

    const volumeRows = store.read<LegacyVolumeBarRecord>({
      stream: 'legacy/volume/BTCUSDT/1m',
      day: '2026-08-08',
    })
    expect(volumeRows).toHaveLength(2)
    expect(volumeRows[0].source).toBe('cloudtrade')
    expect(volumeRows[0].sourceRevision).toBe(3)
    expect(volumeRows[0].buyVolume).toBe(11.00825)
  })

  it('重复执行幂等，不再新增记录', () => {
    const { home, root } = createFixture()
    migrateCloudtradeData({ rootDir: root, cloudtradeHome: home, now: () => NOW })
    const second = migrateCloudtradeData({ rootDir: root, cloudtradeHome: home, now: () => NOW })

    expect(second.manifest.options.recordsImported).toBe(0)
    expect(second.manifest.volume.barsImported).toBe(0)
  })
})
