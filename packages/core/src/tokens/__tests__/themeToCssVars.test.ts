/**
 * Tests for `themeToCssVars` / `toCssDeclarationBlock`.
 *
 * Acceptance criteria:
 *   1. Every theme key (colors × 32 + palette × 10 + spacing × 9
 *      + typography × 9 + motion × 5 = 65) maps to a CSS variable.
 *   2. Variable names follow `--klc-{family}-{kebab-key}` exactly.
 *   3. Camel→kebab transform is correct on edge cases (single-letter,
 *      already-kebab, trailing digits).
 *   4. Custom prefix is honoured.
 *   5. Prefix without `--` throws (misuse caught early).
 *   6. mergeTheme overrides surface in the emit output.
 *   7. toCssDeclarationBlock produces parseable CSS.
 */

import { describe, it, expect } from 'vitest'

import {
    lightTheme,
    darkTheme,
    mergeTheme,
} from '..'
import { camelToKebab, themeToCssVars, toCssDeclarationBlock } from '../themeToCssVars'

describe('camelToKebab', () => {
    it.each([
        ['candleUpBody', 'candle-up-body'],
        ['fontWeightRegular', 'font-weight-regular'],
        ['i1', 'i1'],
        ['i10', 'i10'],
        ['background', 'background'],
        ['durationFast', 'duration-fast'],
        ['fontFamilyMono', 'font-family-mono'],
    ])('%s → %s', (input, expected) => {
        expect(camelToKebab(input)).toBe(expected)
    })
})

function countColorLeaves(c: Record<string, unknown>): number {
    let count = 0
    for (const v of Object.values(c)) {
        if (v !== null && typeof v === 'object') {
            count += countColorLeaves(v as Record<string, unknown>)
        } else {
            count++
        }
    }
    return count
}

describe('themeToCssVars — coverage', () => {
    it('emits the expected number of variables for lightTheme', () => {
        const vars = themeToCssVars(lightTheme)
        const expectedCount =
            countColorLeaves(lightTheme.colors as unknown as Record<string, unknown>) +
            Object.keys(lightTheme.spacing).length +
            Object.keys(lightTheme.typography).length +
            Object.keys(lightTheme.motion).length
        expect(Object.keys(vars)).toHaveLength(expectedCount)
    })

    it('every var name starts with --klc- by default', () => {
        const vars = themeToCssVars(lightTheme)
        for (const k of Object.keys(vars)) {
            expect(k.startsWith('--klc-')).toBe(true)
        }
    })

    it('every var value is a non-empty string', () => {
        const vars = themeToCssVars(lightTheme)
        for (const v of Object.values(vars)) {
            expect(typeof v).toBe('string')
            expect(v.length).toBeGreaterThan(0)
        }
    })
})

describe('themeToCssVars — naming', () => {
    it('colors.background → --klc-color-background', () => {
        const vars = themeToCssVars(lightTheme)
        expect(vars['--klc-color-background']).toBe(lightTheme.colors.background)
    })

    it('colors.candleUpBody → --klc-color-candle-up-body', () => {
        const vars = themeToCssVars(lightTheme)
        expect(vars['--klc-color-candle-up-body']).toBe(lightTheme.colors.candleUpBody)
    })

    it('colors.palette.i1 → --klc-color-palette-i1', () => {
        const vars = themeToCssVars(lightTheme)
        expect(vars['--klc-color-palette-i1']).toBe(lightTheme.colors.palette.i1)
    })

    it('spacing.md → --klc-spacing-md', () => {
        const vars = themeToCssVars(lightTheme)
        expect(vars['--klc-spacing-md']).toBe(lightTheme.spacing.md)
    })

    it('typography.fontWeightRegular → string-cast number', () => {
        const vars = themeToCssVars(lightTheme)
        expect(vars['--klc-typography-font-weight-regular']).toBe(
            String(lightTheme.typography.fontWeightRegular),
        )
    })

    it('motion.durationFast → --klc-motion-duration-fast', () => {
        const vars = themeToCssVars(lightTheme)
        expect(vars['--klc-motion-duration-fast']).toBe(lightTheme.motion.durationFast)
    })
})

describe('themeToCssVars — prefix', () => {
    it('honours a custom prefix', () => {
        const vars = themeToCssVars(lightTheme, { prefix: '--chart-' })
        expect(vars['--chart-color-background']).toBe(lightTheme.colors.background)
        expect(vars['--klc-color-background']).toBeUndefined()
    })

    it('throws when the prefix does not start with --', () => {
        expect(() => themeToCssVars(lightTheme, { prefix: 'klc-' })).toThrow(
            /must start with '--'/,
        )
    })
})

describe('themeToCssVars — light vs dark parity', () => {
    it('both themes produce maps with the exact same key set', () => {
        const l = Object.keys(themeToCssVars(lightTheme)).sort()
        const d = Object.keys(themeToCssVars(darkTheme)).sort()
        expect(l).toEqual(d)
    })
})

describe('themeToCssVars — mergeTheme propagation', () => {
    it('an override surfaces in the emit output', () => {
        const custom = mergeTheme(lightTheme, {
            colors: { candleUpBody: '#112233' },
        })
        expect(themeToCssVars(custom)['--klc-color-candle-up-body']).toBe('#112233')
    })

    it('non-overridden keys keep the base value', () => {
        const custom = mergeTheme(lightTheme, {
            colors: { candleUpBody: '#112233' },
        })
        expect(themeToCssVars(custom)['--klc-color-background']).toBe(
            lightTheme.colors.background,
        )
    })
})

describe('toCssDeclarationBlock', () => {
    it('produces a parseable :root block by default', () => {
        const css = toCssDeclarationBlock(themeToCssVars(lightTheme))
        expect(css.startsWith(':root {\n')).toBe(true)
        expect(css.endsWith('\n}')).toBe(true)
        expect(css).toContain('--klc-color-background: ' + lightTheme.colors.background + ';')
    })

    it('honours a custom selector', () => {
        const css = toCssDeclarationBlock(
            themeToCssVars(darkTheme),
            '[data-theme="dark"]',
        )
        expect(css.startsWith('[data-theme="dark"] {\n')).toBe(true)
    })

    it('emits one declaration per line', () => {
        const vars = themeToCssVars(lightTheme)
        const css = toCssDeclarationBlock(vars)
        // count of `;` lines should equal the number of vars
        const semicolons = (css.match(/;/g) ?? []).length
        expect(semicolons).toBe(Object.keys(vars).length)
    })
})
