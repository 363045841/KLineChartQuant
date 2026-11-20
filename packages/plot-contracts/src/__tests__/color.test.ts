/** 脚本颜色解析：主题色别名、透明度后缀与 CSS 直传的唯一边界。 */
import { describe, expect, it } from 'vitest'
import { Color, parseScriptColor, SCRIPT_COLOR_ALIASES } from '../color.js'

describe('脚本颜色', () => {
  it.each([
    { value: Color.Teal, expected: { kind: 'alias', alias: 'teal', alpha: '' } },
    { value: `${Color.Teal}80`, expected: { kind: 'alias', alias: 'teal', alpha: '80' } },
    { value: '#ff000080', expected: { kind: 'css', value: '#ff000080' } },
    { value: 'rgb(1 2 3 / 50%)', expected: { kind: 'css', value: 'rgb(1 2 3 / 50%)' } },
  ])('解析 $value', ({ value, expected }) => {
    expect(parseScriptColor(value)).toEqual(expected)
  })

  it.each(['@unknown', '@teal8', '@'])('拒绝非法别名：%s', (value) => {
    expect(() => parseScriptColor(value)).toThrow('Unknown script color alias')
  })

  it('别名集合与 Color 中的主题色一一对应', () => {
    const aliases = Object.values(Color)
      .filter((value) => value.startsWith('@'))
      .map((value) => value.slice(1))
    expect(SCRIPT_COLOR_ALIASES).toEqual(aliases)
  })
})
