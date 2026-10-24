/**
 * 脚本颜色别名解析测试。
 *
 * 这一层是别名契约与 tokens 之间唯一的接线处，因此守住三件事：
 *   1. 每个别名都能解析成主题里的具体色值；
 *   2. alpha 后缀原样保留，CSS 字面量不参与解析；
 *   3. 未知别名直接报错，不退化成透明或默认色。
 */
import { SCRIPT_COLOR_ALIASES } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { darkTheme, lightTheme } from '../index.js'
import { createScriptColorResolver } from '../scriptColorResolver.js'

const light = createScriptColorResolver(lightTheme.colors)
const dark = createScriptColorResolver(darkTheme.colors)

describe('createScriptColorResolver', () => {
  it('resolves every alias to the theme palette value', () => {
    for (const alias of SCRIPT_COLOR_ALIASES) {
      expect(light(`@${alias}`)).toBe(lightTheme.colors.scriptPalette[alias])
    }
  })

  it('appends the alpha suffix after the resolved theme color', () => {
    expect(light('@teal80')).toBe(`${lightTheme.colors.scriptPalette.teal}80`)
    expect(dark('@redcc')).toBe(`${darkTheme.colors.scriptPalette.red}cc`)
  })

  it('passes CSS colors through untouched', () => {
    for (const value of ['#808080', 'rgba(0, 0, 0, 0.4)', 'red', '']) {
      expect(light(value)).toBe(value)
    }
  })

  it('rejects unknown aliases instead of falling back', () => {
    expect(() => light('@chartreuse')).toThrow(TypeError)
    expect(() => light('@red8')).toThrow(TypeError)
    expect(() => light('@')).toThrow(TypeError)
  })
})
