/**
 * 脚本 Color 枚举的解释层：别名 → 当前主题的实际色值。
 *
 * 别名由 plot-contracts 声明，色值由 tokens SSOT 提供；这里是唯一把两者接起来的地方。
 * 解析是 ColorTokens 的纯函数：换主题后必须用新的 ColorTokens 重新创建解析器，
 * 不要跨主题缓存结果。
 */

import { parseScriptColor } from '@363045841yyt/klinechart-plot-contracts'

import type { ColorTokens } from './types.js'

/** 把脚本颜色（别名或 CSS 字面量）解析成渲染可用的颜色字符串。 */
export type ScriptColorResolver = (value: string) => string

/**
 * 按给定主题创建解析器。
 *
 * @param colors 当前主题的颜色 Token，别名的色值从这里取
 * @returns 解析函数；CSS 字面量原样返回，别名替换成主题色并保留 alpha 后缀
 */
export function createScriptColorResolver(colors: ColorTokens): ScriptColorResolver {
  return (value) => {
    // 命名空间token直接解析当前主题，不复制任何指标专用颜色表。
    if (value.startsWith('@token:')) {
      let token: unknown = colors
      for (const key of value.slice(7).split('.')) {
        if (token === null || typeof token !== 'object' || !Object.hasOwn(token, key)) throw new TypeError(`Unknown theme color token: ${value}`)
        token = Reflect.get(token, key)
      }
      if (typeof token !== 'string') throw new TypeError(`Theme token is not a color: ${value}`)
      return token
    }
    const parsed = parseScriptColor(value)
    if (parsed.kind === 'css') return parsed.value
    return `${colors.scriptPalette[parsed.alias]}${parsed.alpha}`
  }
}
