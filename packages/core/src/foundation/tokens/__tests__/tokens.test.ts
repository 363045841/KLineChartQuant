/**
 * Design token contract tests.
 *
 * What this enforces:
 *   1. **Theme parity** — `lightTheme` and `darkTheme` have the exact
 *      same key set in every token family. Adding a key to one without
 *      the other is the most common source of "looks fine in dev,
 *      breaks in production" theme bugs.
 *   2. **Color validity** — every color token parses as a CSS color
 *      we can hand the renderer. We accept 6/8-digit hex, plus the
 *      single named `transparent` keyword.
 *   3. **WCAG contrast** — bull/bear vs background must reach the AA
 *      threshold (≥ 3:1 for non-text graphics). This is the floor;
 *      themes are encouraged to exceed it.
 *   4. **Merge semantics** — `mergeTheme(base, override)` is shallow
 *      per family, deep on `colors.palette`, and never mutates inputs.
 */

import { describe, it, expect } from 'vitest'

import {
  lightTheme,
  darkTheme,
  mergeTheme,
  withAsiaMarketColors,
  resolveThemeColors,
  type Theme,
  type ColorTokens,
  type IndicatorPalette,
} from '..'

describe('performance color tokens', () => {
  it('亚洲市场约定交换正负收益颜色并保留中性色', () => {
    const asiaTheme = withAsiaMarketColors(lightTheme)

    expect(asiaTheme.colors.performancePositive).toBe(lightTheme.colors.performanceNegative)
    expect(asiaTheme.colors.performanceNegative).toBe(lightTheme.colors.performancePositive)
    expect(asiaTheme.colors.performanceNeutral).toBe(lightTheme.colors.performanceNeutral)
  })
})

// ---------------------------------------------------------------------------
// Color parsing & contrast helpers (kept inline so tests don't reach into
// renderer internals — those will arrive in a later tick).
// ---------------------------------------------------------------------------

const HEX = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/
const RGBA = /^rgba?\(/
const HSLA = /^hsla?\(/

function parseHex(color: string): { r: number; g: number; b: number } | null {
  if (!HEX.test(color)) return null
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return { r, g, b }
}

function relativeLuminance(c: string): number {
  const p = parseHex(c)
  if (p === null) throw new Error(`relativeLuminance: ${c} not parseable`)
  const linear = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linear(p.r) + 0.7152 * linear(p.g) + 0.0722 * linear(p.b)
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// ---------------------------------------------------------------------------
// Parity
// ---------------------------------------------------------------------------

function keysSorted(o: object): string[] {
  return Object.keys(o).sort()
}

describe('theme parity', () => {
  it('lightTheme and darkTheme expose the same top-level families', () => {
    expect(keysSorted(lightTheme)).toEqual(keysSorted(darkTheme))
  })

  it.each([
    ['colors', (t: Theme) => t.colors],
    ['spacing', (t: Theme) => t.spacing],
    ['typography', (t: Theme) => t.typography],
    ['motion', (t: Theme) => t.motion],
  ] as const)('family %s has the same key set in both themes', (_name, pick) => {
    expect(keysSorted(pick(lightTheme))).toEqual(keysSorted(pick(darkTheme)))
  })

  it('palette has the same i1..i10 keys in both themes', () => {
    expect(keysSorted(lightTheme.colors.palette)).toEqual(keysSorted(darkTheme.colors.palette))
    expect(keysSorted(lightTheme.colors.palette)).toEqual([
      'i1',
      'i10',
      'i2',
      'i3',
      'i4',
      'i5',
      'i6',
      'i7',
      'i8',
      'i9',
      'indicatorAtr',
    ])
  })
})

// ---------------------------------------------------------------------------
// Color value validity
// ---------------------------------------------------------------------------

function colorEntries(c: ColorTokens, prefix = ''): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const [k, v] of Object.entries(c)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) {
      out.push(...colorEntries(v as unknown as ColorTokens, key))
    } else {
      out.push([key, v as string])
    }
  }
  return out
}

describe('color value validity', () => {
  for (const theme of [lightTheme, darkTheme]) {
    for (const [key, value] of colorEntries(theme.colors)) {
      it(`${theme.name}: ${key} is a valid CSS color string`, () => {
        // Top-level tokens are hex; legacy compatibility groups
        // may use rgba/hsl/transparent.
        const valid =
          HEX.test(value) || RGBA.test(value) || HSLA.test(value) || value === 'transparent'
        expect(valid).toBe(true)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// WCAG AA non-text contrast (≥ 3:1) for the bull / bear roles
// ---------------------------------------------------------------------------

function hexBase(c: string): string {
  // Drop alpha if present so contrast is measured against the unmuted hue.
  return c.length === 9 ? c.slice(0, 7) : c
}

describe('WCAG AA contrast — candle bull/bear vs background (≥ 3:1)', () => {
  for (const theme of [lightTheme, darkTheme]) {
    for (const role of ['candleUpBody', 'candleDownBody'] as const) {
      it(`${theme.name}: ${role}`, () => {
        const ratio = contrast(hexBase(theme.colors[role]), hexBase(theme.colors.background))
        expect(ratio).toBeGreaterThanOrEqual(3)
      })
    }
  }
})

describe('WCAG AA contrast — foreground text vs background (≥ 4.5:1)', () => {
  for (const theme of [lightTheme, darkTheme]) {
    it(`${theme.name}`, () => {
      const ratio = contrast(hexBase(theme.colors.foreground), hexBase(theme.colors.background))
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('dark theme grid colors', () => {
  it('uses restrained cool-gray contrast against the chart background', () => {
    expect(darkTheme.colors.gridMajor).toBe('#2A3547')
    expect(darkTheme.colors.gridMinor).toBe('#202A39')
  })
})

// ---------------------------------------------------------------------------
// Asia-market (红涨绿跌) colour convention
// ---------------------------------------------------------------------------

/**
 * 判断颜色是否为「红」（以 R 分量显著高于 G/B 衡量）。
 * 主题里 bull/bear 使用的都是低饱和、色相明确的颜色，无需做严格解析。
 */
function isReddish(color: string): boolean {
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/.exec(color)
  if (!m) return false
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return r > g && r > b
}

describe('Asia-market colour convention (红涨绿跌)', () => {
  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('%s: base theme uses Western convention (bull=green, bear=red)', (_name, theme) => {
    expect(isReddish(theme.colors.candleDownBody)).toBe(true)
    expect(isReddish(theme.colors.candleUpBody)).toBe(false)
    expect(isReddish(theme.colors.volumeDown)).toBe(true)
    expect(isReddish(theme.colors.volumeUp)).toBe(false)
    // MACD 柱与蜡烛遵循同一涨跌约定：多头（正柱）用绿色，空头（负柱）用红色
    expect(isReddish(theme.colors.macd.barDown)).toBe(true)
    expect(isReddish(theme.colors.macd.barUp)).toBe(false)
  })

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('%s: Asia-market swap yields red-up/green-down everywhere', (_name, theme) => {
    const asia = withAsiaMarketColors(theme)
    expect(isReddish(asia.colors.candleUpBody)).toBe(true)
    expect(isReddish(asia.colors.candleDownBody)).toBe(false)
    expect(isReddish(asia.colors.volumeUp)).toBe(true)
    expect(isReddish(asia.colors.volumeDown)).toBe(false)
    // MACD 正柱（多头）= 红，负柱（空头）= 绿
    expect(isReddish(asia.colors.macd.barUp)).toBe(true)
    expect(isReddish(asia.colors.macd.barDown)).toBe(false)
    expect(isReddish(asia.colors.macd.barUpLight)).toBe(true)
    expect(isReddish(asia.colors.macd.barDownLight)).toBe(false)
  })

  it.each(['light', 'dark'] as const)(
    '%s: resolveThemeColors keeps MACD convention aligned with candles',
    (themeName) => {
      const western = resolveThemeColors(themeName, false)
      expect(isReddish(western.macd.barDown)).toBe(true)
      expect(isReddish(western.macd.barUp)).toBe(false)

      const asia = resolveThemeColors(themeName, true)
      expect(isReddish(asia.macd.barUp)).toBe(true)
      expect(isReddish(asia.macd.barDown)).toBe(false)
      expect(asia.macd.barUp).toBe(western.macd.barDown)
      expect(asia.macd.barDown).toBe(western.macd.barUp)
    },
  )
})

// ---------------------------------------------------------------------------
// mergeTheme
// ---------------------------------------------------------------------------

describe('mergeTheme', () => {
  it('returns a new theme; never mutates the base', () => {
    const before = JSON.stringify(lightTheme)
    const merged = mergeTheme(lightTheme, {
      name: 'custom',
      colors: { candleUpBody: '#111111' },
    })
    expect(JSON.stringify(lightTheme)).toBe(before)
    expect(merged).not.toBe(lightTheme)
  })

  it('override wins for each specified key; base wins elsewhere', () => {
    const merged = mergeTheme(lightTheme, {
      colors: { candleUpBody: '#111111' },
    })
    expect(merged.colors.candleUpBody).toBe('#111111')
    expect(merged.colors.candleDownBody).toBe(lightTheme.colors.candleDownBody)
    expect(merged.colors.background).toBe(lightTheme.colors.background)
  })

  it('palette merges per-key, not whole-replace', () => {
    const merged = mergeTheme(lightTheme, {
      colors: { palette: { i1: '#000000' } as IndicatorPalette },
    })
    expect(merged.colors.palette.i1).toBe('#000000')
    expect(merged.colors.palette.i2).toBe(lightTheme.colors.palette.i2)
    expect(merged.colors.palette.i10).toBe(lightTheme.colors.palette.i10)
  })

  it('name override propagates', () => {
    const merged = mergeTheme(lightTheme, { name: 'corporate' })
    expect(merged.name).toBe('corporate')
  })

  it('no override returns a structurally-equal theme', () => {
    const merged = mergeTheme(lightTheme, {})
    expect(merged).toEqual(lightTheme)
  })
})
