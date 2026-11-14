/**
 * 旧版期权关键位历史的按天清理。
 *
 * cloudtrade 时代的数据落在 `legacy/options-levels/<SYMBOL>/<YYYY-MM-DD>.jsonl.gz`，
 * 不归 DayShardStore 管，所以单独一个只做删除的函数。只处理符合日期命名的文件，
 * 目录里其他文件一律不动。
 */
import { readdirSync, rmdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** 旧版关键位目录（相对数据根）。 */
export const LEGACY_OPTIONS_LEVELS_DIR = 'legacy/options-levels'

/** 旧版文件命名：`2026-11-09.jsonl.gz`。 */
const DAY_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.jsonl\.gz$/

/** 单个品种的清理结果。 */
export interface LegacyPruneResult {
  /** 品种目录名 */
  readonly symbol: string
  /** 被删除的日期 */
  readonly removed: readonly string[]
}

/**
 * 删除早于截止日期的旧版期权关键位文件，并清理删空的品种目录。
 *
 * @param rootDir 数据根目录
 * @param beforeDay 截止日期（不含），形如 `YYYY-MM-DD`
 * @returns 每个品种被删除的日期；目录不存在时返回空数组
 */
export function pruneLegacyOptionsLevels(
  rootDir: string,
  beforeDay: string,
): readonly LegacyPruneResult[] {
  const baseDir = join(rootDir, LEGACY_OPTIONS_LEVELS_DIR)
  let symbols: readonly string[]
  try {
    symbols = readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }

  const results: LegacyPruneResult[] = []
  for (const symbol of symbols) {
    const symbolDir = join(baseDir, symbol)
    let files: readonly string[]
    try {
      files = readdirSync(symbolDir)
    } catch {
      continue
    }
    const removed = files
      .map((name) => {
        const matched = DAY_FILE_PATTERN.exec(name)
        return matched === null ? null : { name, day: matched[1] }
      })
      .filter((entry): entry is { name: string; day: string } => entry !== null)
      .filter((entry) => entry.day < beforeDay)
      .map((entry) => entry.day)

    for (const day of removed) rmSync(join(symbolDir, `${day}.jsonl.gz`), { force: true })
    if (removed.length > 0) {
      results.push({ symbol, removed })
      try {
        rmdirSync(symbolDir)
      } catch {
        // 目录里还有未过期的文件，保留。
      }
    }
  }
  return results
}
