/**
 * Design tokens v2 foundation contract.
 *
 * Values come from task research (craft-principles §4, design §3.3, ADR 0007);
 * each one's source is in its DTCG `$description`. These tests lock the values
 * and the invariants the research implies, so a later edit has to be explicit.
 */
import { describe, expect, it } from 'vitest'

import {
  darkFoundation,
  darkTheme,
  FOUNDATION_GROUPS,
  foundationTokens,
  lightFoundation,
  lightTheme,
  mergeTheme,
  resolveTheme,
  type TextScaleStep,
  THEME_PRESETS,
  themeToCssVars,
} from '..'

const px = (v: string) => Number.parseFloat(v)

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('foundation tokens: values (craft-principles §4, design §3.3)', () => {
  const f = lightFoundation

  it('radius 0 / 4 / 6 / 8 / 12 / 16 / full', () => {
    expect(f.radius).toEqual({
      0: '0',
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      full: '9999px',
    })
    // 同心规则：xs = sm − 2px 内边距（S33）。
    expect(px(f.radius.sm) - px(f.radius.xs)).toBe(2)
  })

  it('type scale: sizes, no 10px, 11px only as mono', () => {
    const steps: TextScaleStep[] = [12, 13, 14, 16, 20, 24, 32, 48, 72]
    expect(steps.map((s) => f.text[s].fontSize)).toEqual(steps.map((s) => `${s}px`))
    expect(f.text['11Mono']).toMatchObject({ fontSize: '11px', lineHeight: '16px' })
    expect(f.text['11Mono'].fontFamily).toContain('monospace')
    const all = JSON.stringify(f.text)
    expect(all).not.toContain('"10px"')
    expect(f.text.numeric).toBe('tabular-nums')
  })

  it('tracking tightens as size grows (CP 17)', () => {
    const steps: TextScaleStep[] = [12, 13, 14, 16, 20, 24, 32, 48, 72]
    const tracking = steps.map((s) => Number.parseFloat(f.text[s].letterSpacing) || 0)
    for (let i = 1; i < tracking.length; i++)
      expect(tracking[i]).toBeLessThanOrEqual(tracking[i - 1] as number)
    expect(f.text[72].lineHeight).toBe(0.9)
  })

  it('label and copy roles reuse the scale; labels ≤ 16 are 500, copy keeps the scale weight', () => {
    for (const s of [12, 13, 14, 16] as const) {
      expect(f.text.label[s]).toEqual({ ...f.text[s], fontWeight: 500 })
    }
    expect(f.text.label[20]).toEqual(f.text[20])
    for (const s of [13, 14, 16, 20, 24] as const) expect(f.text.copy[s]).toEqual(f.text[s])
  })

  it('space follows Carbon 2..160 (S28)', () => {
    expect(Object.values(f.space).map(px)).toEqual([
      2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160,
    ])
  })

  it('density 24 / 32 / 40 / 48 with 24 / 44 hit targets', () => {
    expect(f.density).toEqual({
      compact: '24px',
      default: '32px',
      comfortable: '40px',
      touch: '48px',
      hitTarget: '24px',
      hitTargetTouch: '44px',
    })
  })

  it('motion: easings, ordered durations, flash 500 / fade 1000', () => {
    expect(f.motion.ease).toEqual({
      out: 'cubic-bezier(0.23, 1, 0.32, 1)',
      inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
      drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
    })
    const { dur } = f.motion
    const ui = [dur[0], dur.press, dur.fast, dur.base, dur.slow].map(px)
    expect(ui).toEqual([0, 140, 160, 200, 260])
    // UI 动效低于 300ms（CP 34）；sheet 与 toast 是唯二例外。
    expect(Math.max(...ui)).toBeLessThan(300)
    expect([dur.sheet, dur.toast]).toEqual(['500ms', '400ms'])
    expect([f.motion.flash, f.motion.fade]).toEqual(['500ms', '1000ms'])
    expect([f.motion.loaderDelay, f.motion.loaderMin, f.motion.stagger]).toEqual([
      '200ms',
      '400ms',
      '40ms',
    ])
  })

  it('z-index layers rise in the design §3.3 order', () => {
    const order = [
      'base',
      'chartOverlay',
      'sticky',
      'dropdown',
      'popover',
      'modal',
      'toast',
      'tooltip',
    ] as const
    expect(Object.keys(f.zIndex)).toEqual(order)
    const values = order.map((k) => f.zIndex[k])
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(new Set(values).size).toBe(values.length)
  })

  it('breakpoints 640 / 768 / 1024 / 1280', () => {
    expect(f.breakpoint).toEqual({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px' })
  })
})

describe('foundation tokens: per mode', () => {
  it('light and dark expose the same keys; only elevation and accent text differ', () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' ? keys(v).map((x) => `${k}.${x}`) : [k],
      )
    expect(keys(darkFoundation)).toEqual(keys(lightFoundation))
    const differing = keys(lightFoundation).filter((k) => {
      const get = (o: object) => k.split('.').reduce<unknown>((n, p) => (n as never)?.[p], o)
      return get(lightFoundation) !== get(darkFoundation)
    })
    expect(differing.every((k) => k.startsWith('elevation.') || k === 'brand.accentText')).toBe(
      true,
    )
    expect(foundationTokens).toEqual({ light: lightFoundation, dark: darkFoundation })
  })

  it('light elevation stacks ≥ 2 layers plus a hairline; dark keeps the same geometry', () => {
    for (const f of [lightFoundation, darkFoundation]) {
      expect(f.elevation[1].split('), ').length).toBe(2)
      expect(f.elevation[2].split('), ').length).toBe(3)
      expect(f.elevation[3].split('), ').length).toBe(5)
      expect(f.elevation.hairline).toMatch(/^0 0 0 1px /)
    }
  })

  it('brand accent Instrument Cobalt meets AA on the Pro surfaces (ADR 0007)', () => {
    expect(lightFoundation.brand.accent).toBe('#4C77C6')
    expect(darkFoundation.brand.accent).toBe('#4C77C6')
    expect(darkFoundation.brand.accentText).toBe('#537ECD')
    expect(lightFoundation.brand.accentText).toBe('#456FBD')
    const darkBg = darkTheme.colors.ui.background
    const lightBg = lightTheme.colors.ui.background
    // UI / focus ring ≥ 3:1（ADR 记录 4.10 与 4.05）。
    expect(contrast('#4C77C6', darkBg)).toBeCloseTo(4.1, 1)
    expect(contrast('#4C77C6', lightBg)).toBeCloseTo(4.05, 1)
    // 作为文字 ≥ 4.5:1。
    expect(contrast(darkFoundation.brand.accentText, darkBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(lightFoundation.brand.accentText, lightBg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('foundation tokens: Theme integration', () => {
  it('lightTheme / darkTheme stay frozen: no foundation, no new CSS vars', () => {
    expect(lightTheme.foundation).toBeUndefined()
    expect(darkTheme.foundation).toBeUndefined()
    expect(Object.keys(themeToCssVars(lightTheme)).some((k) => k.startsWith('--klc-radius'))).toBe(
      false,
    )
  })

  it('resolveTheme attaches the mode foundation for every preset and market convention', () => {
    for (const { id } of THEME_PRESETS)
      for (const mode of ['light', 'dark'] as const)
        for (const asia of [false, true])
          expect(resolveTheme(mode, asia, { preset: id }).foundation).toBe(foundationTokens[mode])
  })

  it('themeToCssVars emits --klc-* names for every foundation group', () => {
    const vars = themeToCssVars(resolveTheme('dark'))
    expect(vars['--klc-radius-sm']).toBe('6px')
    expect(vars['--klc-text-label-13-font-weight']).toBe('500')
    expect(vars['--klc-text-11-mono-font-size']).toBe('11px')
    expect(vars['--klc-text-numeric']).toBe('tabular-nums')
    expect(vars['--klc-space-16']).toBe('16px')
    expect(vars['--klc-density-hit-target-touch']).toBe('44px')
    expect(vars['--klc-elevation-hairline']).toBe('0 0 0 1px hsl(0 0% 100% / 0.08)')
    expect(vars['--klc-motion-ease-in-out']).toBe('cubic-bezier(0.77, 0, 0.175, 1)')
    expect(vars['--klc-motion-dur-0']).toBe('0ms')
    expect(vars['--klc-motion-flash']).toBe('500ms')
    expect(vars['--klc-z-index-modal']).toBe('1100')
    expect(vars['--klc-breakpoint-sm']).toBe('640px')
    expect(vars['--klc-brand-accent-text']).toBe('#537ECD')
    // 旧 motion 变量保持原值，与新 dur-* 不冲突。
    expect(vars['--klc-motion-duration-fast']).toBe('120ms')
    for (const g of FOUNDATION_GROUPS)
      expect(
        Object.keys(vars).some((k) => k.startsWith(`--klc-${g.replace('zIndex', 'z-index')}-`)),
      ).toBe(true)
  })

  it('mergeTheme keeps and shallow-merges foundation only when the base has it', () => {
    expect('foundation' in mergeTheme(lightTheme, {})).toBe(false)
    const base = resolveTheme('light')
    const merged = mergeTheme(base, {
      foundation: { radius: { ...lightFoundation.radius, sm: '4px' } },
    })
    expect(merged.foundation?.radius.sm).toBe('4px')
    expect(merged.foundation?.space).toBe(lightFoundation.space)
    expect(base.foundation?.radius.sm).toBe('6px')
  })
})
