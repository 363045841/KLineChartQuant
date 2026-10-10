/**
 * stylelint 插件：ADR 0004「packages/vue/src 不得出现刻度外的原始值」。
 *
 * klc/no-raw-length：padding / margin / gap / border-radius / font-size 不得写原始 px，
 *   改用 tokens-v2（--klc-space-* / --klc-radius-* / --klc-text-*）。
 * klc/no-raw-z-index：z-index 只能是 var(--klc-z-index-*) 或局部层叠的 -1 / 0 / 1。
 * klc/no-raw-color：不得写原始颜色（#hex、rgb()/rgba()/hsl()/hsla()），改用 --klc-color-* /
 *   --klc-elevation-*；color-mix() 内引用 token 是允许的。
 *
 * `var(--token, 16px)` 中的回退值不计入：组件可以带回退值消费尚未发布的 token。
 */
import stylelint from 'stylelint'

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint

const LENGTH_PROPERTIES =
  /^(padding|margin|gap|row-gap|column-gap|border-radius|border-(top|bottom)-(left|right)-radius|border-(start|end)-(start|end)-radius|font-size)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/

/** 去掉 var(...) 的回退部分，只保留 `var(--name)`，以免把回退值当作原始值。 */
export function stripVarFallbacks(value) {
  let output = ''
  let index = 0
  while (index < value.length) {
    const start = value.indexOf('var(', index)
    if (start === -1) {
      output += value.slice(index)
      break
    }
    output += value.slice(index, start)
    let depth = 0
    let end = start
    for (; end < value.length; end += 1) {
      const char = value[end]
      if (char === '(') depth += 1
      else if (char === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    const inner = value.slice(start + 4, end)
    const comma = inner.indexOf(',')
    output += `var(${comma === -1 ? inner : inner.slice(0, comma)})`
    index = end + 1
  }
  return output
}

const lengthRule = 'klc/no-raw-length'
const lengthMessages = ruleMessages(lengthRule, {
  rejected: (property, value) =>
    `Raw "${value}" in "${property}": use a tokens-v2 variable (--klc-space-*, --klc-radius-*, --klc-text-*) (ADR 0004)`,
})

const noRawLength = createPlugin(lengthRule, (enabled) => (root, result) => {
  if (!validateOptions(result, lengthRule, { actual: enabled })) return
  root.walkDecls((decl) => {
    if (!LENGTH_PROPERTIES.test(decl.prop.toLowerCase())) return
    const match = stripVarFallbacks(decl.value).match(/(?<![\w-])-?\d*\.?\d+px\b/)
    if (!match || /^-?0*\.?0+px$/.test(match[0])) return
    report({
      ruleName: lengthRule,
      result,
      node: decl,
      message: lengthMessages.rejected(decl.prop, match[0]),
      word: match[0],
    })
  })
})
noRawLength.ruleName = lengthRule
noRawLength.messages = lengthMessages

const zRule = 'klc/no-raw-z-index'
const zMessages = ruleMessages(zRule, {
  rejected: (value) =>
    `Raw z-index "${value}": use var(--klc-z-index-*) or the top layer (<dialog>, popover) (ADR 0004)`,
})

const noRawZIndex = createPlugin(zRule, (enabled) => (root, result) => {
  if (!validateOptions(result, zRule, { actual: enabled })) return
  root.walkDecls((decl) => {
    if (decl.prop.toLowerCase() !== 'z-index') return
    const value = stripVarFallbacks(decl.value).trim()
    if (/^var\(--klc-z-index-[\w-]+\)$/.test(value)) return
    if (/^(-1|0|1|auto|inherit|initial|unset|revert)$/.test(value)) return
    report({ ruleName: zRule, result, node: decl, message: zMessages.rejected(decl.value) })
  })
})
noRawZIndex.ruleName = zRule
noRawZIndex.messages = zMessages

const colorRule = 'klc/no-raw-color'
const colorMessages = ruleMessages(colorRule, {
  rejected: (value) =>
    `Raw colour "${value}": use a --klc-color-* / --klc-elevation-* token (ADR 0004)`,
})

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/

const noRawColor = createPlugin(colorRule, (enabled) => (root, result) => {
  if (!validateOptions(result, colorRule, { actual: enabled })) return
  root.walkDecls((decl) => {
    // 自定义属性的定义本身就是 token 层（如组件私有变量），不在此检查。
    if (decl.prop.startsWith('--')) return
    const match = stripVarFallbacks(decl.value).match(RAW_COLOR)
    if (!match) return
    report({
      ruleName: colorRule,
      result,
      node: decl,
      message: colorMessages.rejected(match[0].replace(/\($/, '()')),
      word: match[0],
    })
  })
})
noRawColor.ruleName = colorRule
noRawColor.messages = colorMessages

export default [noRawLength, noRawZIndex, noRawColor]
