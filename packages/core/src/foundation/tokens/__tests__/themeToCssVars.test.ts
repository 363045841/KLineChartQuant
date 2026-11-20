/**
 * `themeToCssVars` / `toCssDeclarationBlock` 的契约测试。
 *
 * 覆盖：主题叶子到 CSS 变量的完整映射、命名规则、前缀、mergeTheme 传播、
 * motion 仅由 v2 foundation 输出、CSS 声明块可解析。
 */

import { describe, expect, it } from 'vitest'

import { darkTheme, lightTheme, mergeTheme } from '..'
import { lightFoundation } from '../foundation.js'
import { camelToKebab, themeToCssVars, toCssDeclarationBlock } from '../themeToCssVars'

function countColorLeaves(c: object): number {
  let count = 0
  for (const v of Object.values(c)) {
    if (v !== null && typeof v === 'object') {
      count += countColorLeaves(v)
    } else {
      count++
    }
  }
  return count
}

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

describe('themeToCssVars', () => {
  it('每个主题叶子输出一个以 --klc- 开头的非空字符串变量', () => {
    const vars = themeToCssVars(lightTheme)
    const expectedCount =
      countColorLeaves(lightTheme.colors) +
      Object.keys(lightTheme.spacing).length +
      Object.keys(lightTheme.typography).length

    expect(Object.keys(vars)).toHaveLength(expectedCount)
    for (const [name, value] of Object.entries(vars)) {
      expect(name.startsWith('--klc-')).toBe(true)
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it.each([
    ['--klc-color-background', lightTheme.colors.background],
    ['--klc-color-floating-surface', lightTheme.colors.floatingSurface],
    ['--klc-color-candle-up-body', lightTheme.colors.candleUpBody],
    ['--klc-color-performance-positive', lightTheme.colors.performancePositive],
    ['--klc-color-palette-i1', lightTheme.colors.palette.i1],
    ['--klc-color-ui-danger', lightTheme.colors.ui.danger],
    ['--klc-spacing-md', lightTheme.spacing.md],
    ['--klc-typography-font-weight-bold', String(lightTheme.typography.fontWeightBold)],
  ])('%s 取自主题对应字段', (name, value) => {
    expect(themeToCssVars(lightTheme)[name]).toBe(value)
  })

  it('motion 只由 v2 foundation 输出', () => {
    expect(themeToCssVars(lightTheme)['--klc-motion-dur-fast']).toBeUndefined()

    const vars = themeToCssVars({ ...lightTheme, foundation: lightFoundation })
    expect(vars['--klc-motion-dur-fast']).toBe('160ms')
    expect(vars['--klc-motion-ease-standard']).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })

  it('自定义前缀替换默认前缀', () => {
    const vars = themeToCssVars(lightTheme, { prefix: '--chart-' })
    expect(vars['--chart-color-background']).toBe(lightTheme.colors.background)
    expect(vars['--klc-color-background']).toBeUndefined()
  })

  it('前缀不以 -- 开头时抛错', () => {
    expect(() => themeToCssVars(lightTheme, { prefix: 'klc-' })).toThrow(/must start with '--'/)
  })

  it('light 与 dark 输出完全相同的变量名集合', () => {
    expect(Object.keys(themeToCssVars(lightTheme)).sort()).toEqual(
      Object.keys(themeToCssVars(darkTheme)).sort(),
    )
  })

  it('mergeTheme 覆写值进入输出，未覆写字段保持原值', () => {
    const custom = mergeTheme(lightTheme, {
      colors: { candleUpBody: '#112233' },
    })
    const vars = themeToCssVars(custom)

    expect(vars['--klc-color-candle-up-body']).toBe('#112233')
    expect(vars['--klc-color-background']).toBe(lightTheme.colors.background)
  })
})

describe('toCssDeclarationBlock', () => {
  it('默认生成可解析的 :root 块，每个变量一行', () => {
    const vars = themeToCssVars(lightTheme)
    const css = toCssDeclarationBlock(vars)

    expect(css.startsWith(':root {\n')).toBe(true)
    expect(css.endsWith('\n}')).toBe(true)
    expect(css).toContain(`--klc-color-background: ${lightTheme.colors.background};`)
    expect((css.match(/;/g) ?? []).length).toBe(Object.keys(vars).length)
  })

  it('支持自定义选择器', () => {
    const css = toCssDeclarationBlock(themeToCssVars(darkTheme), '[data-theme="dark"]')
    expect(css.startsWith('[data-theme="dark"] {\n')).toBe(true)
  })
})
