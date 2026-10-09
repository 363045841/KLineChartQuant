/**
 * Contrast audit shared by the CI gate (contrastGate.test.ts) and the report
 * script (scripts/tokens/contrast-report.mts).
 *
 * WCAG 2 AA is the hard gate: 4.5:1 for text, 3:1 for UI components and
 * graphical objects (WCAG 1.4.3 / 1.4.11; design §3.2, tooling.md §2).
 * APCA Lc is advisory only (beta, non-OSI license; tooling.md): text should reach
 * Lc 60 and UI Lc 45, the APCA levels that roughly map to 4.5:1 and 3:1
 * (craft-principles CP 5, S25).
 */
import Color from 'colorjs.io'
import { THEME_PRESETS } from '../presets/impl/themePresets.js'
import type { ThemePresetId } from '../presets/types.js'
import { resolveTheme } from '../theme-china.js'
import type { Theme } from '../types.js'

export type PairKind = 'text' | 'ui'
export type Convention = 'green-up' | 'red-up'

export interface ContrastPair {
  /** Stable id, used as the key in contrast-known-failures.json. */
  readonly id: string
  /** Dotted path into the resolved Theme. */
  readonly fg: string
  readonly bg: string
  readonly kind: PairKind
}

export const WCAG_FLOOR: Readonly<Record<PairKind, number>> = { text: 4.5, ui: 3 }
export const APCA_ADVISORY: Readonly<Record<PairKind, number>> = { text: 60, ui: 45 }

const text = (fg: string, bg: string, id?: string): ContrastPair => ({
  id: id ?? `${fg.split('.').at(-1)} on ${bg.split('.').at(-1)}`,
  fg,
  bg,
  kind: 'text',
})
const ui = (fg: string, bg: string, id?: string): ContrastPair => ({
  ...text(fg, bg, id),
  kind: 'ui',
})

/** Declared foreground / background pairs, as rendered by the chart and its chrome. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Text (≥ 4.5:1)
  text('colors.ui.text', 'colors.ui.background'),
  text('colors.ui.text', 'colors.ui.surface'),
  text('colors.ui.text', 'colors.ui.card'),
  text('colors.ui.muted', 'colors.ui.background'),
  text('colors.ui.muted', 'colors.ui.surface'),
  text('colors.ui.textSoft', 'colors.ui.background'),
  text('colors.axisText', 'colors.chartBackground'),
  text('colors.tooltipText', 'colors.tooltipBg'),
  text('colors.crosshairLabelText', 'colors.crosshairLabelBg'),
  text('colors.ui.onAccent', 'colors.ui.accent'),
  text('colors.ui.secondaryButtonText', 'colors.ui.controlBackground'),
  text('colors.ui.warningText', 'colors.ui.warningBackground'),
  text('colors.ui.dangerText', 'colors.ui.dangerBackground'),
  text('colors.performancePositive', 'colors.background'),
  text('colors.performanceNegative', 'colors.background'),
  text('colors.performanceNeutral', 'colors.background'),
  text('foundation.brand.accentText', 'colors.ui.background', 'brand accentText on background'),
  // UI components and graphical objects (≥ 3:1)
  ui('colors.candleUpBody', 'colors.chartBackground'),
  ui('colors.candleDownBody', 'colors.chartBackground'),
  ui('colors.selectionStroke', 'colors.chartBackground'),
  ui('colors.crosshairLine', 'colors.chartBackground'),
  ui('colors.alertActive', 'colors.chartBackground'),
  ui('colors.alertTriggered', 'colors.chartBackground'),
  ui('colors.ui.focus', 'colors.ui.background'),
  ui('colors.ui.accent', 'colors.ui.background'),
  ui('colors.ui.borderStrong', 'colors.ui.background'),
  ui('foundation.brand.accent', 'colors.ui.background', 'brand accent on background'),
]

export interface AuditRow {
  readonly key: string
  readonly preset: ThemePresetId
  readonly mode: 'light' | 'dark'
  readonly convention: Convention
  readonly pair: ContrastPair
  readonly fg: string
  readonly bg: string
  readonly wcag: number
  readonly apca: number
  readonly floor: number
  readonly pass: boolean
  readonly apcaAdvisoryPass: boolean
}

function get(theme: Theme, path: string): string {
  const v = path.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], theme)
  if (typeof v !== 'string') throw new Error(`contrast audit: ${path} is not a color`)
  return v
}

/** Composite a translucent color over an opaque backdrop in sRGB, as the browser paints it. */
function flatten(color: string, backdrop: Color): Color {
  const c = new Color(color).to('srgb')
  const a = Number.isNaN(c.alpha) ? 1 : Number(c.alpha)
  if (a >= 1) return c
  const b = backdrop.to('srgb')
  const coords = c.coords.map((v, i) => (Number(v) || 0) * a + (Number(b.coords[i]) || 0) * (1 - a))
  return new Color('srgb', coords as [number, number, number])
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

export function auditTheme(
  theme: Theme,
  meta: { preset: ThemePresetId; mode: 'light' | 'dark'; convention: Convention },
): AuditRow[] {
  const page = new Color(get(theme, 'colors.background')).to('srgb')
  return CONTRAST_PAIRS.map((pair) => {
    const fgRaw = get(theme, pair.fg)
    const bgRaw = get(theme, pair.bg)
    const bg = flatten(bgRaw, page)
    const fg = flatten(fgRaw, bg)
    const wcag = round(Color.contrastWCAG21(fg, bg), 2)
    const apca = round(Color.contrastAPCA(bg, fg), 1)
    const floor = WCAG_FLOOR[pair.kind]
    return {
      key: `${meta.preset}/${meta.mode}/${meta.convention}/${pair.id}`,
      ...meta,
      pair,
      fg: fgRaw,
      bg: bgRaw,
      wcag,
      apca,
      floor,
      pass: wcag >= floor,
      apcaAdvisoryPass: Math.abs(apca) >= APCA_ADVISORY[pair.kind],
    }
  })
}

/** Every mode × preset × up/down combination, resolved the way the chart resolves it. */
export function auditAll(): AuditRow[] {
  const rows: AuditRow[] = []
  for (const { id } of THEME_PRESETS)
    for (const mode of ['light', 'dark'] as const)
      for (const convention of ['green-up', 'red-up'] as const) {
        const theme = resolveTheme(mode, convention === 'red-up', { preset: id })
        rows.push(...auditTheme(theme, { preset: id, mode, convention }))
      }
  return rows
}

export interface KnownFailures {
  readonly $comment: string
  /** key → WCAG ratio recorded when the failure was accepted as known. */
  readonly failures: Readonly<Record<string, number>>
}

/** A regression is a failing pair that is not known, or a known one that got worse. */
export function findRegressions(rows: readonly AuditRow[], known: KnownFailures): AuditRow[] {
  return rows.filter((r) => {
    if (r.pass) return false
    const recorded = known.failures[r.key]
    return recorded === undefined || r.wcag < recorded - 0.005
  })
}
