/**
 * Theme baseline snapshots.
 *
 * Purpose: lock the SHIPPED look. Any change to the light or dark
 * theme — adding a token, changing a value, renaming a key — shows
 * up as a snapshot diff and forces an explicit review. The intent is
 * the same as a visual-regression baseline (pixel diff against a
 * rendered chart), one layer earlier: the tokens are the source of
 * truth that the renderer turns into pixels.
 *
 * What we snapshot, and why:
 *
 *   1. The full CSS declaration block emitted via
 *      `toCssDeclarationBlock(themeToCssVars(theme))`. This is the
 *      exact text that lands in a stylesheet when a consumer
 *      installs the theme, so the snapshot is what *users* see.
 *
 *   2. A contrast report. Each color-vs-background ratio is rounded
 *      to two decimals and dumped as a Markdown table. A bull/bear
 *      tweak that crosses the WCAG threshold shows up in the diff
 *      AND in the explicit assertion below.
 *
 * To update an intentional change: run `vitest -u` and review the
 * diff carefully. The reviewer's checklist: is the new value
 * accessible? Does the new key follow the naming convention?
 */

import { describe, it, expect } from 'vitest'

import {
    lightTheme,
    darkTheme,
    themeToCssVars,
    toCssDeclarationBlock,
} from '..'

// ---------------------------------------------------------------------------
// Local contrast helpers (kept inline so the snapshot files don't reach
// into renderer internals).
// ---------------------------------------------------------------------------

const HEX_WITH_ALPHA = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/

function parseHex(color: string): { r: number; g: number; b: number } | null {
    if (!HEX_WITH_ALPHA.test(color)) return null
    return {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16),
    }
}

function relLum(c: string): number | null {
    const p = parseHex(c)
    if (p === null) return null
    const linear = (v: number): number => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * linear(p.r) + 0.7152 * linear(p.g) + 0.0722 * linear(p.b)
}

function contrast(a: string, b: string): number | null {
    const la = relLum(a)
    const lb = relLum(b)
    if (la === null || lb === null) return null
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
}

function hexBase(c: string): string {
    return c.length === 9 ? c.slice(0, 7) : c
}

/**
 * Roles we want explicitly contrast-tracked. Adding to this list expands
 * the baseline. The audit categories are: must-be-visible (candle, axis,
 * crosshair) and prefer-strong (palette, accent).
 */
interface TrackedRole {
    role: string
    threshold: number
    /** Role this is measured against. Default `'background'`. */
    against?: string
}

const TRACKED_ROLES: ReadonlyArray<TrackedRole> = [
    // Floor 4.5:1 (WCAG AA for normal text). Text-on-tinted-surface roles
    // (crosshair label, tooltip) are measured against their own surface,
    // NOT the chart background, since that's where they actually render.
    { role: 'foreground', threshold: 4.5 },
    { role: 'axisText', threshold: 4.5 },
    { role: 'crosshairLabelText', threshold: 4.5, against: 'crosshairLabelBg' },
    { role: 'tooltipText', threshold: 4.5, against: 'tooltipBg' },
    // Floor 3:1 (WCAG AA for non-text graphic objects)
    { role: 'candleUpBody', threshold: 3 },
    { role: 'candleDownBody', threshold: 3 },
    { role: 'candleDojiBorder', threshold: 3 },
    { role: 'crosshairLine', threshold: 3 },
    { role: 'selectionStroke', threshold: 3 },
    { role: 'alertActive', threshold: 3 },
    { role: 'alertTriggered', threshold: 3 },
    { role: 'avwapLine', threshold: 3 },
    { role: 'mtfOverlay', threshold: 3 },
]

function buildContrastReport(theme: typeof lightTheme): string {
    const lines: string[] = []
    lines.push(`# Theme contrast — ${theme.name}`)
    lines.push('')
    lines.push('Each role is measured against its own surface (default: `colors.background`).')
    lines.push('')
    lines.push('| Role | Value | Surface | Ratio | Floor | Pass |')
    lines.push('|---|---|---|---|---|---|')
    for (const { role, threshold, against } of TRACKED_ROLES) {
        const value = (theme.colors as unknown as Record<string, string>)[role]
        const surfaceKey = against ?? 'background'
        const surfaceVal = (theme.colors as unknown as Record<string, string>)[surfaceKey]
        const r = contrast(hexBase(value), hexBase(surfaceVal))
        const ratio = r === null ? 'n/a' : r.toFixed(2)
        const pass = r === null ? '?' : r >= threshold ? '✅' : '❌'
        lines.push(`| ${role} | ${hexBase(value)} | ${surfaceKey} | ${ratio} | ${threshold.toFixed(1)}:1 | ${pass} |`)
    }
    const bg = hexBase(theme.colors.background)
    // Palette is a separate section — informational only, no fixed floor.
    lines.push('')
    lines.push('## Indicator palette')
    lines.push('')
    lines.push('| Slot | Value | Ratio vs BG |')
    lines.push('|---|---|---|')
    for (const [k, v] of Object.entries(theme.colors.palette)) {
        const r = contrast(hexBase(v), bg)
        const ratio = r === null ? 'n/a' : r.toFixed(2)
        lines.push(`| ${k} | ${v} | ${ratio} |`)
    }
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

describe('theme baseline — light', () => {
    it('CSS declaration block (snapshot)', () => {
        const css = toCssDeclarationBlock(themeToCssVars(lightTheme))
        expect(css).toMatchSnapshot()
    })

    it('contrast report (snapshot)', () => {
        expect(buildContrastReport(lightTheme)).toMatchSnapshot()
    })
})

describe('theme baseline — dark', () => {
    it('CSS declaration block (snapshot)', () => {
        const css = toCssDeclarationBlock(themeToCssVars(darkTheme))
        expect(css).toMatchSnapshot()
    })

    it('contrast report (snapshot)', () => {
        expect(buildContrastReport(darkTheme)).toMatchSnapshot()
    })
})

// ---------------------------------------------------------------------------
// Explicit threshold assertions — supplement the snapshot diff with
// hard fails when an essential role drops below its WCAG floor.
// ---------------------------------------------------------------------------

describe('theme baseline — contrast floors hold', () => {
    for (const theme of [lightTheme, darkTheme]) {
        for (const { role, threshold, against } of TRACKED_ROLES) {
            it(`${theme.name}: ${role} ≥ ${threshold}:1`, () => {
                const value = (theme.colors as unknown as Record<string, string>)[role]
                const surfaceKey = against ?? 'background'
                const surface = (theme.colors as unknown as Record<string, string>)[surfaceKey]
                const r = contrast(hexBase(value), hexBase(surface))
                expect(r).not.toBeNull()
                expect(r as number).toBeGreaterThanOrEqual(threshold)
            })
        }
    }
})
