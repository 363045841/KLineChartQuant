/**
 * WCAG AA contrast gate over every mode × preset × up/down combination.
 *
 * The current palettes already fail AA in a few places. Those failures are
 * recorded in contrast-known-failures.json (Phase 1 baseline, fixed in Phase 3
 * when the presets are regenerated). The gate fails only on regressions: a
 * failing pair that is not recorded, or a recorded one whose ratio drops.
 * The full report, including the advisory APCA numbers, is produced by
 * `pnpm tokens:contrast` (design-tokens/reports/contrast.md).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

import { THEME_PRESETS } from '..'
import { auditAll, CONTRAST_PAIRS, findRegressions, type KnownFailures } from './contrastAudit'

const known: KnownFailures = JSON.parse(
  fs.readFileSync(new URL('./contrast-known-failures.json', import.meta.url), 'utf8'),
)
const rows = auditAll()

describe('contrast gate (WCAG 2 AA)', () => {
  it('audits every mode × preset × up/down combination', () => {
    const combos = new Set(rows.map((r) => `${r.preset}/${r.mode}/${r.convention}`))
    expect(combos.size).toBe(THEME_PRESETS.length * 2 * 2)
    expect(rows).toHaveLength(combos.size * CONTRAST_PAIRS.length)
  })

  it('has no regressions against the known-failure baseline', () => {
    const regressions = findRegressions(rows, known).map(
      (r) => `${r.key}: ${r.wcag}:1 < ${r.floor}:1 (fg ${r.fg}, bg ${r.bg})`,
    )
    expect(regressions).toEqual([])
  })

  it('candle up/down stay ≥ 3:1 on the chart background in every combination', () => {
    // 行情颜色是语义色，不能进入已知失败清单。
    const candles = rows.filter((r) => r.pair.id.startsWith('candle'))
    expect(candles.filter((r) => !r.pass).map((r) => r.key)).toEqual([])
    expect(Object.keys(known.failures).some((k) => k.includes('/candle'))).toBe(false)
  })

  it('the regression check catches new and worsened failures', () => {
    const failing = rows.find((r) => !r.pass)
    expect(failing).toBeDefined()
    if (!failing) return
    expect(findRegressions([failing], { $comment: '', failures: {} })).toHaveLength(1)
    const worse = { ...failing, wcag: failing.wcag - 0.1 }
    expect(findRegressions([worse], known)).toHaveLength(1)
    expect(findRegressions([failing], known)).toHaveLength(0)
  })
})
